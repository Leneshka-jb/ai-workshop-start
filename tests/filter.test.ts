// The filter in spec/web.md: the API over HTTP, and the page itself, run against the server with a
// minimal DOM, so the header it shows is checked as the user sees it.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { replay, type Recording } from '../src/core/replay.ts';
import { createWebServer } from '../src/web/server.ts';

const COMMIT = '1111111111111111111111111111111111111111';

/** A repository on GitHub with the given SKILL.md files. */
function repository(id: string, files: Record<string, string>): Recording {
  return {
    [`https://api.github.com/repos/${id}`]: { status: 200, body: { full_name: id, default_branch: 'main' } },
    [`https://api.github.com/repos/${id}/commits/main`]: { status: 200, body: { sha: COMMIT } },
    [`https://api.github.com/repos/${id}/git/trees/${COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob', sha: path })) },
    },
    ...Object.fromEntries(Object.entries(files).map(([path, body]) => [
      `https://raw.githubusercontent.com/${id}/${COMMIT}/${path}`, { status: 200, body },
    ])),
  };
}

const GITHUB = replay({
  ...repository('JetBrains/many', {
    'skills/commits/SKILL.md': '---\nname: commits\ndescription: Write commit messages. Use for every commit.\n---\n# Release notes\n',
    'skills/release/SKILL.md': '---\nname: Release-Notes\ndescription: Draft the changelog for a version.\n---\n',
    'skills/review/SKILL.md': '---\nname: review\ndescription: Review a pull request before the RELEASE.\n---\n',
    'skills/broken/SKILL.md': '---\nname: [unclosed\n---\nrelease\n',
  }),
  ...repository('JetBrains/empty', {}),
});

const BROKEN_WARNING = 'skills/broken/SKILL.md: malformed front matter: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 16; using the directory name';

async function serve(t: TestContext): Promise<string> {
  const server = createWebServer({ fetch: GITHUB });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

type Result = { skills: { name: string }[]; total: number; warnings: string[] };

async function api(base: string, repo: string, filter?: string): Promise<Result> {
  const query = `repo=${encodeURIComponent(repo)}${filter === undefined ? '' : `&filter=${encodeURIComponent(filter)}`}`;
  const response = await fetch(`${base}/api/scan?${query}`);
  assert.equal(response.status, 200);
  return (await response.json()) as Result;
}

const names = (result: Result) => result.skills.map((skill) => skill.name);

test('API: without a filter, or with an empty one, every skill and the total', async (t) => {
  const base = await serve(t);
  for (const filter of [undefined, '', '   ']) {
    const result = await api(base, 'https://github.com/JetBrains/many', filter);
    assert.deepEqual(names(result), ['Release-Notes', 'broken', 'commits', 'review'], String(filter));
    assert.equal(result.total, 4);
  }
});

test('API: the filter matches the name or the description, ignoring case, trimmed; not the body', async (t) => {
  const base = await serve(t);
  const cases: Record<string, string[]> = {
    // The name, in another case; the description, in another case. Not the body of commits or broken.
    release: ['Release-Notes', 'review'],
    '  COMMIT ': ['commits'],
    'pull request': ['review'],
    changelog: ['Release-Notes'],
    BROK: ['broken'],
  };
  for (const [filter, expected] of Object.entries(cases)) {
    const result = await api(base, 'https://github.com/JetBrains/many', filter);
    assert.deepEqual(names(result), expected, filter);
    assert.equal(result.total, 4, filter);
  }
});

test('API: nothing matches → no skills, the total, and the warnings unfiltered', async (t) => {
  const result = await api(await serve(t), 'https://github.com/JetBrains/many', 'deploy');
  assert.deepEqual(result.skills, []);
  assert.equal(result.total, 4);
  assert.deepEqual(result.warnings, [BROKEN_WARNING]);
});

/** A tiny DOM: just what the page's script uses. */
class Node {
  textContent = '';
  className = '';
  hidden = false;
  disabled = false;
  value = '';
  href = '';
  target = '';
  rel = '';
  children: Node[] = [];
  listeners: Record<string, (event: { preventDefault(): void }) => unknown> = {};
  tag: string;
  parts: Record<string, Node>;
  constructor(tag: string, parts: Record<string, Node> = {}) { this.tag = tag; this.parts = parts; }
  append(...nodes: Node[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Node[]) { this.children = nodes; }
  querySelector(selector: string) { return this.parts[selector]; }
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown) { this.listeners[type] = listener; }
}

/** Loads the served page's script, types into its inputs, submits, and returns the header and skill names. */
async function page(base: string, repo: string, filter: string) {
  const html = await (await fetch(base)).text();
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const nodes: Record<string, Node> = {
    form: new Node('form', { button: new Node('button') }),
    repo: new Node('input'),
    filter: new Node('input'),
    status: new Node('div'),
    skills: new Node('div'),
    warnings: new Node('details', { summary: new Node('summary'), ul: new Node('ul') }),
  };
  const document = { getElementById: (id: string) => nodes[id], createElement: (tag: string) => new Node(tag) };
  let done!: Promise<unknown>;
  runInNewContext(script, { document, fetch: (path: string) => (done = fetch(base + path)) });
  nodes.repo.value = repo;
  nodes.filter.value = filter;
  await nodes.form.listeners.submit({ preventDefault() {} });
  await done;
  return {
    status: nodes.status.textContent,
    error: nodes.status.className === 'error',
    skills: nodes.skills.children.map((card) => card.children[0].textContent),
    warnings: nodes.warnings.hidden ? '' : nodes.warnings.parts.summary.textContent,
  };
}

test('GET / → a second input, for the filter', async (t) => {
  const html = await (await fetch(await serve(t))).text();
  assert.match(html, /<input id="filter"[^>]*type="search"/);
});

test('page: an empty filter → `<owner>/<repo> · N skills` and every skill', async (t) => {
  const base = await serve(t);
  assert.deepEqual(await page(base, 'https://github.com/JetBrains/many', ' '), {
    status: 'JetBrains/many · 4 skills', error: false, skills: ['Release-Notes', 'broken', 'commits', 'review'], warnings: '1 warning',
  });
});

test('page: a filter → `<owner>/<repo> · M of N skills` and the matches', async (t) => {
  const base = await serve(t);
  assert.deepEqual(await page(base, 'https://github.com/JetBrains/many', 'RELEASE'), {
    status: 'JetBrains/many · 2 of 4 skills', error: false, skills: ['Release-Notes', 'review'], warnings: '1 warning',
  });
  assert.equal((await page(base, 'https://github.com/JetBrains/many', 'commit')).status, 'JetBrains/many · 1 of 4 skills');
});

test('page: nothing matches → `No matching skills`, the warnings still shown', async (t) => {
  assert.deepEqual(await page(await serve(t), 'https://github.com/JetBrains/many', 'deploy'), {
    status: 'JetBrains/many · No matching skills', error: false, skills: [], warnings: '1 warning',
  });
});

test('page: no skills even before filtering → `No skills found`, with or without a filter', async (t) => {
  const base = await serve(t);
  for (const filter of ['', 'release']) {
    assert.deepEqual(await page(base, 'https://github.com/JetBrains/empty', filter), {
      status: 'JetBrains/empty · No skills found', error: false, skills: [], warnings: '',
    }, filter);
  }
});
