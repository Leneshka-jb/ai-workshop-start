import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createBrowserBackend } from '../src/browser.ts';
import { run } from '../src/commands.ts';
import { openGitHub, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { CLI, EXAMPLE_COMMIT } from './helpers.ts';

const CONTENT = '---\nname: shared\ndescription: First sentence. Second sentence.\n---\n# Instructions\n';

function directory(t: TestContext, files: Record<string, string | Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-grouping-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function recordedRepository(files: Record<string, string | undefined>) {
  const repository = 'JetBrains/grouping';
  const api = `https://api.github.com/repos/${repository}`;
  const paths = Object.keys(files);
  const recording: Recording = {
    [api]: { status: 200, body: { full_name: repository, default_branch: 'main' } },
    [`${api}/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${api}/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: paths.map((path) => ({ path, mode: '100644', type: 'blob', sha: 'unused' })) },
    },
    [`https://api.github.com/search/code?q=filename:SKILL.md+repo:${repository}&per_page=100&page=1`]: {
      status: 200, body: { total_count: paths.length, items: paths.map((path) => ({ path })) },
    },
  };
  for (const [path, body] of Object.entries(files)) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    recording[`https://raw.githubusercontent.com/${repository}/${EXAMPLE_COMMIT}/${encoded}`] = {
      status: body === undefined ? 404 : 200, body: body ?? '',
    };
  }
  const requests: string[] = [];
  const recorded = replay(recording);
  const fetch: Fetch = async (url, init) => {
    requests.push(url);
    return recorded(url, init);
  };
  return { url: `https://github.com/${repository}`, fetch, requests };
}

test('local copies become one skill with complete content and all encoded links in CLI output', async (t) => {
  const content = `\uFEFF${CONTENT.replaceAll('\n', '\r\n')}\r\n`;
  const paths = ['z-copy/SKILL.md', 'a space #/SKILL.md'];
  const root = directory(t, Object.fromEntries(paths.map((path) => [path, content])));
  const result = await scan(await openDirectory(root));
  const links = [...paths].sort().map((path) => ({
    repository: result.repository.id, path, url: pathToFileURL(join(root, path)).href,
  }));
  assert.deepEqual(result.skills, [{
    id: `${result.repository.id}:a space #/SKILL.md`, content, name: 'shared',
    description: 'First sentence. Second sentence.', links,
  }]);
  assert.deepEqual(result.warnings, []);
  for (const link of result.skills[0].links) assert.equal(readFileSync(new URL(link.url), 'utf8'), content);

  const cli = spawnSync(process.execPath, [CLI, 'scan', root], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stderr, '');
  assert.equal(cli.stdout, [
    `${result.repository.id} · 1 skill`, 'shared — First sentence.', ...links.map((link) => `  ${link.url}`), '',
  ].join('\n'));
});

test('equality uses complete bytes, not metadata, normalized text or decoded replacement characters', async (t) => {
  const encoded = new TextEncoder().encode(CONTENT);
  const files = {
    'base/SKILL.md': encoded,
    'copy/SKILL.md': encoded,
    'body/SKILL.md': `${CONTENT}Different body\n`,
    'space/SKILL.md': `${CONTENT} `,
    'crlf/SKILL.md': CONTENT.replaceAll('\n', '\r\n'),
    'newline/SKILL.md': CONTENT.trimEnd(),
    'bom/SKILL.md': `\uFEFF${CONTENT}`,
    'invalid-a/SKILL.md': new Uint8Array([...encoded, 0xff]),
    'invalid-b/SKILL.md': new Uint8Array([...encoded, 0xfe]),
  };
  const root = directory(t, files);
  const result = await scan(await openDirectory(root));
  assert.equal(result.skills.length, Object.keys(files).length - 1);
  assert.deepEqual(result.skills.find((skill) => skill.links.length > 1)?.links.map((link) => link.path), [
    'base/SKILL.md', 'copy/SKILL.md',
  ]);
  assert.equal(result.skills.flatMap((skill) => skill.links).length, Object.keys(files).length);
  for (const skill of result.skills) {
    const bytes = readFileSync(new URL(skill.links[0].url));
    for (const link of skill.links) assert.deepEqual(readFileSync(new URL(link.url)), bytes);
  }
  const invalid = result.skills.filter((skill) => skill.links[0].path.startsWith('invalid-'));
  assert.equal(invalid.length, 2);
  assert.equal(invalid[0].content, invalid[1].content);
});

test('IDs, fallback names, links and skill order do not depend on discovery or read completion order', async (t) => {
  const unnamed = '---\ndescription: Shared instructions.\n---\nBody\n';
  const root = directory(t, {
    'zeta/SKILL.md': unnamed,
    'Alpha/SKILL.md': unnamed,
    'other-b/SKILL.md': `${CONTENT}B`,
    'other-a/SKILL.md': `${CONTENT}A`,
  });
  const source = await openDirectory(root);
  const expected = await scan(source);
  assert.equal(expected.skills[0].id, `${source.repository.id}:Alpha/SKILL.md`);
  assert.equal(expected.skills[0].name, 'Alpha');
  assert.deepEqual(expected.skills.map((skill) => skill.links[0].path), [
    'Alpha/SKILL.md', 'other-a/SKILL.md', 'other-b/SKILL.md',
  ]);
  for (const paths of [[...source.paths].reverse(), [...source.paths.slice(1), source.paths[0]]]) {
    const pending = new Map<string, (bytes: Uint8Array | undefined) => void>();
    const result = scan({
      ...source, paths,
      read: (path) => new Promise((resolve) => { pending.set(path, resolve); }),
    });
    // Every read starts before any finishes; finish them in reverse source order.
    assert.deepEqual([...pending.keys()], [...source.paths].sort());
    for (const path of [...pending.keys()].reverse()) pending.get(path)!(await source.read(path));
    assert.deepEqual(await result, expected);
  }
});

test('a root-level canonical file falls back to the repository name', async (t) => {
  const content = '---\ndescription: No name.\n---\nBody\n';
  const root = directory(t, { 'copy/SKILL.md': content, 'SKILL.md': content });
  const result = await scan(await openDirectory(root));
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].id, `${result.repository.id}:SKILL.md`);
  assert.equal(result.skills[0].name, result.repository.name);
  assert.deepEqual(result.warnings, []);
});

test('empty files are valid grouping inputs and retain a warning for each source', async (t) => {
  const root = directory(t, { 'b/SKILL.md': '', 'a/SKILL.md': '' });
  const result = await scan(await openDirectory(root));
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].content, '');
  assert.equal(result.skills[0].name, 'a');
  assert.equal(result.skills[0].links.length, 2);
  assert.deepEqual(result.warnings, ['a', 'b'].map((name) => `${name}/SKILL.md: no front matter; using the directory name`));
});

test('GitHub groups copies and pins every link without extra requests, through search and tree discovery', async () => {
  for (const token of ['test', undefined]) {
    const github = recordedRepository({ 'z/SKILL.md': CONTENT, 'a space #/SKILL.md': CONTENT });
    const result = await scan(await openGitHub(github.url, { fetch: github.fetch, token }));
    assert.deepEqual(result.skills, [{
      id: 'JetBrains/grouping:a space #/SKILL.md', content: CONTENT, name: 'shared',
      description: 'First sentence. Second sentence.',
      links: [
        { repository: 'JetBrains/grouping', path: 'a space #/SKILL.md', commit: EXAMPLE_COMMIT,
          url: `${github.url}/blob/${EXAMPLE_COMMIT}/a%20space%20%23/SKILL.md` },
        { repository: 'JetBrains/grouping', path: 'z/SKILL.md', commit: EXAMPLE_COMMIT,
          url: `${github.url}/blob/${EXAMPLE_COMMIT}/z/SKILL.md` },
      ],
    }]);
    assert.deepEqual(result.warnings, []);
    assert.equal(github.requests.length, 5); // repository, commit, discovery, two files
    assert.equal(new Set(github.requests).size, 5);
  }
});

test('malformed copies group with per-file warnings; missing files add no link and scanning continues', async () => {
  const malformed = '---\nname: [broken\n---\nBody\n';
  const files = {
    'z/SKILL.md': malformed, 'a/SKILL.md': malformed,
    '0-missing/SKILL.md': undefined, 'valid/SKILL.md': CONTENT,
  };
  const github = recordedRepository(files);
  const result = await scan(await openGitHub(github.url, { fetch: github.fetch }));
  assert.equal(result.skills.length, 2);
  assert.equal(result.skills[0].id, 'JetBrains/grouping:a/SKILL.md');
  assert.equal(result.skills[0].name, 'a');
  assert.equal(result.skills[0].description, '');
  assert.deepEqual(result.skills[0].links.map((link) => link.path), ['a/SKILL.md', 'z/SKILL.md']);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /^0-missing\/SKILL.md: listed, but not found/);
  assert.match(result.warnings[1], /^a\/SKILL.md: malformed front matter:/);
  assert.match(result.warnings[2], /^z\/SKILL.md: malformed front matter:/);
  assert.equal(github.requests.length, 7);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const command = recordedRepository(files);
  const code = await run(['scan', command.url], {
    open: (input) => openGitHub(input, { fetch: command.fetch }),
    print: (text) => stdout.push(text), error: (text) => stderr.push(text),
  });
  assert.equal(code, 0);
  assert.equal(stdout[0], 'JetBrains/grouping · 2 skills');
  assert.ok(stdout.includes('shared — First sentence.'));
  assert.ok(!stdout.some((line) => /warning:|0-missing/.test(line)));
  assert.deepEqual(stderr, result.warnings.map((warning) => `warning: ${warning}`));
});

test('browser and CLI commands print the same unique count and every source URL', async () => {
  const files = { 'z/SKILL.md': CONTENT, 'a/SKILL.md': CONTENT };
  const github = recordedRepository(files);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', github.url], {
    open: (input) => openGitHub(input, { fetch: github.fetch, token: 'test' }),
    print: (text) => stdout.push(text), error: (text) => stderr.push(text),
  });
  const expected = [
    'JetBrains/grouping · 1 skill', 'shared — First sentence.',
    `  ${github.url}/blob/${EXAMPLE_COMMIT}/a/SKILL.md`,
    `  ${github.url}/blob/${EXAMPLE_COMMIT}/z/SKILL.md`,
  ].join('\n');
  assert.equal(code, 0);
  assert.deepEqual(stderr, []);
  assert.equal(stdout.join('\n'), expected);
  const browser = recordedRepository(files);
  assert.equal(await createBrowserBackend({ fetch: browser.fetch }).run(`skill-atlas scan ${browser.url}`), expected);
});
