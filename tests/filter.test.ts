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
  // A repository of several projects: the root, two plugins sharing one skill, and a tool.
  ...repository('JetBrains/mono', {
    '.agents/skills/setup/SKILL.md': '---\nname: setup\ndescription: Set up the whole repository.\n---\n',
    'plugins/kotlin/.claude/skills/gradle/SKILL.md': '---\nname: gradle\ndescription: Build the Kotlin plugin.\n---\n',
    'plugins/kotlin/.claude/skills/review/SKILL.md': '---\nname: review\ndescription: Review a plugin change.\n---\n',
    'plugins/java/skills/review/SKILL.md': '---\nname: review\ndescription: Review a plugin change.\n---\n',
    'tools/lint/SKILL.md': '---\nname: lint\ndescription: Lint the sources.\n---\n',
  }),
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
  return (await open(base, repo, filter)).seen();
}

/** The page after a scan of `repo` with `filter` already typed; `type` changes the filter as a keystroke would. */
async function open(base: string, repo: string, filter = '') {
  const html = await (await fetch(base)).text();
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const nodes: Record<string, Node> = {
    form: new Node('form', { button: new Node('button') }),
    repo: new Node('input'),
    filter: new Node('input'),
    project: new Node('select'),
    status: new Node('div'),
    table: new Node('table'),
    columns: new Node('tr'),
    skills: new Node('tbody'),
    warnings: new Node('details', { summary: new Node('summary'), ul: new Node('ul') }),
    clusterize: new Node('button'),
    clusters: new Node('section'),
    'clusters-status': new Node('span'),
    'clusters-hide': new Node('button'),
    'cluster-list': new Node('div'),
  };
  const document = { getElementById: (id: string) => nodes[id], createElement: (tag: string) => new Node(tag) };
  let done!: Promise<unknown>;
  const requested: string[] = [];
  let filterHiddenWhileScanning: boolean | undefined;
  runInNewContext(script, {
    URL, document,
    fetch: (path: string) => { requested.push(path); filterHiddenWhileScanning = nodes.filter.hidden; return (done = fetch(base + path)); },
  });
  nodes.repo.value = repo;
  nodes.filter.value = filter;
  await nodes.form.listeners.submit({ preventDefault() {} });
  await done;
  const seen = () => ({
    status: nodes.status.textContent,
    error: nodes.status.className === 'error',
    skills: nodes.skills.children.map((card) => card.children[0].textContent),
    warnings: nodes.warnings.hidden ? '' : nodes.warnings.parts.summary.textContent,
  });
  const type = (text: string) => {
    nodes.filter.value = text;
    nodes.filter.listeners.input?.({ preventDefault() {} });
    return seen();
  };
  return { seen, type, requested, nodes, filterHiddenWhileScanning };
}

test('GET / → a second input, for the filter, under the header and outside the form, with no button', async (t) => {
  const html = await (await fetch(await serve(t))).text();
  assert.match(html, /<input id="filter"[^>]*type="search"[^>]*hidden>/);
  // The form holds the link and its Scan button only; the filter comes right after the header.
  const form = /<form id="form">([\s\S]*?)<\/form>/.exec(html)![1];
  assert.doesNotMatch(form, /id="filter"/);
  assert.equal(form.match(/<button/g)?.length, 1);
  assert.match(html, /<div id="status" role="status"><\/div>\n<input id="filter"/);
  // Smaller than the link input, and without the browser's clear button.
  assert.match(html, /#filter \{[^}]*font-size: \.85rem;/);
  assert.match(html, /#filter::-webkit-search-cancel-button \{[^}]*display: none;/);
});

test('page: the filter is hidden while scanning, then shown under the header of the repository', async (t) => {
  const { nodes, filterHiddenWhileScanning } = await open(await serve(t), 'https://github.com/JetBrains/many');
  assert.equal(filterHiddenWhileScanning, true);
  assert.equal(nodes.filter.hidden, false);
});

test('page: typing filters the last scan at every keystroke, without scanning again', async (t) => {
  const { type, requested, seen } = await open(await serve(t), 'https://github.com/JetBrains/many');
  assert.deepEqual(requested, ['/api/scan?repo=https%3A%2F%2Fgithub.com%2FJetBrains%2Fmany']);
  assert.equal(seen().status, 'JetBrains/many · 4 skills');
  assert.deepEqual(type('rev'), {
    status: 'JetBrains/many · 1 of 4 skills', error: false, skills: ['review'], warnings: '1 warning',
  });
  assert.deepEqual(type(' RELEASE '), {
    status: 'JetBrains/many · 2 of 4 skills', error: false, skills: ['Release-Notes', 'review'], warnings: '1 warning',
  });
  assert.deepEqual(type('changelog').skills, ['Release-Notes']);
  assert.deepEqual(type('deploy'), {
    status: 'JetBrains/many · No matching skills', error: false, skills: [], warnings: '1 warning',
  });
  assert.deepEqual(type(''), {
    status: 'JetBrains/many · 4 skills', error: false, skills: ['Release-Notes', 'broken', 'commits', 'review'], warnings: '1 warning',
  });
  assert.equal(requested.length, 1);
});

test('page: the filter text is kept for the next scan and applied to it', async (t) => {
  const { type, nodes, seen } = await open(await serve(t), 'https://github.com/JetBrains/empty');
  type('review');
  assert.equal(seen().status, 'JetBrains/empty · No skills found');
  nodes.repo.value = 'https://github.com/JetBrains/many';
  await nodes.form.listeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(nodes.filter.value, 'review');
  assert.deepEqual(seen().skills, ['review']);
  assert.equal(seen().status, 'JetBrains/many · 1 of 4 skills');
});

test('page: an error hides the filter', async (t) => {
  const { nodes, seen } = await open(await serve(t), 'https://gitlab.com/owner/repo', 'review');
  assert.equal(seen().error, true);
  assert.equal(seen().status, 'Not a GitHub repository URL: https://gitlab.com/owner/repo');
  assert.equal(nodes.filter.hidden, true);
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

/** Chooses a project in the page's selector, as the user would. */
function choose(nodes: Record<string, Node>, project: string) {
  nodes.project.value = project;
  nodes.project.listeners.change?.({ preventDefault() {} });
}

/** Each row of the table as its cells: name, description and the link paths. */
const rows = (nodes: Record<string, Node>) => nodes.skills.children.map((row) => [
  row.children[0].textContent,
  row.children[1].textContent,
  row.children[2].children[0].children.map((item) => item.children[0].textContent),
]);

test('GET / → the skills go in a table, and the project selector sits next to the filter, hidden', async (t) => {
  const html = await (await fetch(await serve(t))).text();
  assert.match(html, /<input id="filter"[^>]*hidden>\n<select id="project"[^>]*hidden><\/select>/);
  assert.match(html, /<table id="table" hidden><thead><tr id="columns"><\/tr><\/thead><tbody id="skills"><\/tbody><\/table>/);
});

test('page: a table with the columns Name, Description and Links, one row per skill', async (t) => {
  const { nodes } = await open(await serve(t), 'https://github.com/JetBrains/many');
  assert.equal(nodes.table.hidden, false);
  assert.deepEqual(nodes.columns.children.map((th) => th.textContent), ['Name', 'Description', 'Links']);
  assert.deepEqual(rows(nodes)[0], ['Release-Notes', 'Draft the changelog for a version.', ['skills/release/SKILL.md']]);
  const link = nodes.skills.children[0].children[2].children[0].children[0].children[0];
  assert.equal(link.href, `https://github.com/JetBrains/many/blob/${COMMIT}/skills/release/SKILL.md`);
  assert.equal(link.target, '_blank');
});

test('page: no rows → no table', async (t) => {
  const base = await serve(t);
  assert.equal((await open(base, 'https://github.com/JetBrains/empty')).nodes.table.hidden, true);
  const many = await open(base, 'https://github.com/JetBrains/many');
  many.type('deploy');
  assert.equal(many.nodes.table.hidden, true);
  many.type('');
  assert.equal(many.nodes.table.hidden, false);
});

test('page: a repository of one project → no project selector', async (t) => {
  const { nodes } = await open(await serve(t), 'https://github.com/JetBrains/many');
  assert.equal(nodes.project.hidden, true);
});

test('page: several projects → a selector of every project, the root first, with its number of skills', async (t) => {
  const { nodes, seen } = await open(await serve(t), 'https://github.com/JetBrains/mono');
  assert.equal(nodes.project.hidden, false);
  assert.deepEqual(nodes.project.children.map((option) => [option.value, option.textContent]), [
    ['', 'All projects'],
    ['.', '(repository root) · 1 skill'],
    ['plugins/java', 'plugins/java · 1 skill'],
    ['plugins/kotlin', 'plugins/kotlin · 2 skills'],
    ['tools', 'tools · 1 skill'],
  ]);
  assert.equal(nodes.project.value, '');
  assert.equal(seen().status, 'JetBrains/mono · 4 skills');
});

test('page: choosing a project lists its skills only, with their links in it, without scanning again', async (t) => {
  const { nodes, seen, requested } = await open(await serve(t), 'https://github.com/JetBrains/mono');
  choose(nodes, 'plugins/kotlin');
  assert.equal(seen().status, 'JetBrains/mono · plugins/kotlin · 2 skills');
  assert.deepEqual(rows(nodes), [
    ['gradle', 'Build the Kotlin plugin.', ['plugins/kotlin/.claude/skills/gradle/SKILL.md']],
    ['review', 'Review a plugin change.', ['plugins/kotlin/.claude/skills/review/SKILL.md']],
  ]);
  choose(nodes, 'plugins/java');
  assert.deepEqual(rows(nodes), [['review', 'Review a plugin change.', ['plugins/java/skills/review/SKILL.md']]]);
  choose(nodes, '.');
  assert.equal(seen().status, 'JetBrains/mono · (repository root) · 1 skill');
  assert.deepEqual(seen().skills, ['setup']);
  choose(nodes, '');
  assert.equal(seen().status, 'JetBrains/mono · 4 skills');
  assert.deepEqual(rows(nodes).find((row) => row[0] === 'review')![2], [
    'plugins/java/skills/review/SKILL.md', 'plugins/kotlin/.claude/skills/review/SKILL.md',
  ]);
  assert.equal(requested.length, 1);
});

test('page: the filter applies within the chosen project', async (t) => {
  const { nodes, type } = await open(await serve(t), 'https://github.com/JetBrains/mono');
  choose(nodes, 'plugins/kotlin');
  assert.equal(type('review').status, 'JetBrains/mono · plugins/kotlin · 1 of 2 skills');
  assert.equal(type('lint').status, 'JetBrains/mono · plugins/kotlin · No matching skills');
  choose(nodes, 'tools');
  assert.deepEqual(type('lint').skills, ['lint']);
});

test('page: another scan goes back to every project; an error or an organization hides the selector', async (t) => {
  const { nodes, seen } = await open(await serve(t), 'https://github.com/JetBrains/mono');
  choose(nodes, 'tools');
  await nodes.form.listeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(nodes.project.value, '');
  assert.equal(seen().status, 'JetBrains/mono · 4 skills');
  nodes.repo.value = 'https://gitlab.com/owner/repo';
  await nodes.form.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.project.hidden, true);
  assert.equal(nodes.table.hidden, true);
});
