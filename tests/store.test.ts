// The decisions in spec/store.md, checked on what `save` writes and `load` prints for ./fixture, a
// small GitHub repository and an organization answered from recordings.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

const API = 'https://api.github.com';
const SHA = '1111111111111111111111111111111111111111';
const SKILL = '---\nname: review\ndescription: Review a pull request. Then approve.\n---\n# Review\r\n';

function temporary(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'skill-atlas-store-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

const records = (file: string) => readFileSync(file, 'utf8').split('\n').slice(0, -1).map((line) => JSON.parse(line));

function repository(id: string, files: Record<string, string>): Recording {
  const recording: Recording = {
    [`${API}/repos/${id}/commits/main`]: { status: 200, body: { sha: SHA } },
    [`${API}/repos/${id}/git/trees/${SHA}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob', sha: path })) },
    },
  };
  for (const [path, body] of Object.entries(files)) {
    recording[`https://raw.githubusercontent.com/${id}/${SHA}/${path}`] = { status: 200, body };
  }
  return recording;
}

const info = (id: string) => ({ full_name: id, default_branch: 'main' });

const ACME: Recording = {
  [`${API}/users/acme`]: { status: 200, body: { login: 'Acme', type: 'Organization' } },
  [`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`]: {
    status: 200,
    body: [info('Acme/tools'), info('Acme/empty'), info('Acme/agents')],
  },
  ...repository('Acme/agents', { '.claude/skills/review/SKILL.md': SKILL, '.agents/skills/review/SKILL.md': SKILL }),
  ...repository('Acme/tools', { 'README.md': '' }),
  [`${API}/repos/Acme/empty/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
};

test('save a repository → a header, the repository, its skills; load prints what scan printed', async (t) => {
  const file = join(temporary(t), 'nested', 'dir', 'example.txt');
  const saved = await atlas(['save', 'https://github.com/JetBrains/example', file]);
  assert.equal(saved.code, 0, saved.stderr);
  assert.equal(saved.stdout, `Saved 1 repository, 1 skill to ${file}`);
  const link = `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;
  assert.equal(readFileSync(file, 'utf8'), [
    '{"type":"skill-atlas","version":1,"organization":null,"repositories":1}',
    `{"type":"repository","id":"JetBrains/example","organization":"JetBrains","name":"example","url":"https://github.com/JetBrains/example","commit":"${EXAMPLE_COMMIT}","skills":1}`,
    '{"type":"skill","id":"JetBrains/example:.claude/skills/commits/SKILL.md","name":"commits",'
      + '"description":"Write commit messages the way this repository does. Use for every commit.",'
      + `"links":[{"repository":"JetBrains/example","path":".claude/skills/commits/SKILL.md","url":"${link}","commit":"${EXAMPLE_COMMIT}"}],`
      + '"content":"---\\nname: commits\\ndescription: Write commit messages the way this repository does. Use for every commit.\\n---\\n# Commits\\n"}',
    '',
  ].join('\n'));

  // Loading never reaches GitHub.
  const offline = replay({});
  const loaded = await atlas(['load', file], offline);
  const scanned = await atlas(['scan', 'https://github.com/JetBrains/example'], github);
  assert.equal(loaded.code, 0, loaded.stderr);
  assert.equal(loaded.stdout, scanned.stdout);
  assert.equal(loaded.stderr, '');
});

test('save a directory through the real CLI: links omit the commit, warnings are saved and printed again', (t) => {
  const file = join(temporary(t), 'fixture.txt');
  const saved = spawnSync(process.execPath, [CLI, 'save', FIXTURE, file], { encoding: 'utf8' });
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(saved.stdout, `Saved 1 repository, 3 skills to ${file}\n`);
  assert.match(saved.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);

  const lines = records(file);
  assert.equal(lines.at(-1).type, 'warning');
  for (const skill of lines.filter((line) => line.type === 'skill')) {
    for (const link of skill.links) assert.equal('commit' in link, false);
    assert.equal(skill.content, readFileSync(join(FIXTURE, skill.links[0].path), 'utf8'));
  }

  const loaded = spawnSync(process.execPath, [CLI, 'load', file], { encoding: 'utf8' });
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { encoding: 'utf8' });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.equal(loaded.stdout, scanned.stdout);
  assert.equal(loaded.stderr, scanned.stderr);
});

test('save an organization → every repository sorted, unscanned ones with null skills; load lists them', async (t) => {
  const file = join(temporary(t), 'acme.txt');
  const saved = await atlas(['save', 'https://github.com/acme', file], replay(ACME));
  assert.equal(saved.code, 0, saved.stderr);
  assert.equal(saved.stdout, `Saved 3 repositories, 1 skill to ${file}`);
  const warning = `Acme/empty: GitHub answered 409 for ${API}/repos/Acme/empty/commits/main: Git Repository is empty.; not scanned`;
  assert.equal(saved.stderr, `warning: ${warning}`);

  const lines = records(file);
  assert.deepEqual(lines[0], { type: 'skill-atlas', version: 1, organization: { id: 'Acme', url: 'https://github.com/Acme' }, repositories: 3 });
  assert.deepEqual(lines.map((line) => [line.type, line.id ?? line.text, line.skills]), [
    ['skill-atlas', undefined, undefined],
    ['repository', 'Acme/agents', 1],
    ['skill', 'Acme/agents:.agents/skills/review/SKILL.md', undefined],
    ['repository', 'Acme/empty', null],
    ['repository', 'Acme/tools', 0],
    ['warning', warning, undefined],
  ]);
  assert.equal(lines[3].commit, '');
  assert.equal(lines[2].content, SKILL);
  assert.equal(lines[2].links.length, 2);

  const loaded = await atlas(['load', file], replay({}));
  assert.equal(loaded.code, 0, loaded.stderr);
  assert.equal(loaded.stdout, [
    'Acme · 3 repositories',
    '',
    'Acme/agents · 1 skill',
    'review — Review a pull request.',
    `  https://github.com/Acme/agents/blob/${SHA}/.agents/skills/review/SKILL.md`,
    `  https://github.com/Acme/agents/blob/${SHA}/.claude/skills/review/SKILL.md`,
    '',
    'Acme/empty · not scanned',
    '',
    'Acme/tools · 0 skills',
  ].join('\n'));
  assert.equal(loaded.stderr, `warning: ${warning}`);
});

test('a failed scan writes nothing and leaves an existing file as it was', async (t) => {
  const file = join(temporary(t), 'kept.txt');
  writeFileSync(file, 'old');
  const failed = await atlas(['save', 'https://github.com/JetBrains/not-answered', file]);
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /^Cannot reach GitHub: /);
  assert.equal(readFileSync(file, 'utf8'), 'old');

  const missing = join(temporary(t), 'missing.txt');
  assert.equal((await atlas(['save', 'https://github.com/JetBrains/not-answered', missing])).code, 1);
  assert.equal(existsSync(missing), false);
});

test('save replaces an existing file', async (t) => {
  const file = join(temporary(t), 'replaced.txt');
  writeFileSync(file, 'old');
  assert.equal((await atlas(['save', 'https://github.com/JetBrains/example', file])).code, 0);
  assert.equal(records(file)[0].type, 'skill-atlas');
});

test('save and load usage errors', async () => {
  assert.deepEqual(await atlas(['save', 'https://github.com/JetBrains/example']), {
    code: 1, stdout: '', stderr: 'Usage: skill-atlas save <GitHub URL | GitHub organization URL | directory> <file>',
  });
  assert.deepEqual(await atlas(['load']), { code: 1, stdout: '', stderr: 'Usage: skill-atlas load <file>' });
});

test('load errors → a message naming the file, exit code 1', async (t) => {
  const directory = temporary(t);
  const header = '{"type":"skill-atlas","version":1,"organization":null,"repositories":1}';
  const repo = '{"type":"repository","id":"a/b","organization":"a","name":"b","url":"https://github.com/a/b","commit":"c","skills":1}';
  const skill = '{"type":"skill","id":"a/b:SKILL.md","name":"s","description":"","links":[{"repository":"a/b","path":"SKILL.md","url":"u","commit":"c"}],"content":"x"}';
  const cases: [string, string | RegExp][] = [
    ['', 'Not a skill-atlas file: FILE'],
    ['hello\n', 'FILE: line 1: not valid JSON'],
    ['{"type":"other"}\n', 'Not a skill-atlas file: FILE'],
    ['{"type":"skill-atlas","version":2,"organization":null,"repositories":0}\n', 'FILE: unsupported skill-atlas file version 2; expected 1'],
    [`${header}\n[1]\n`, 'FILE: line 2: not a JSON object'],
    [`${header}\n${skill}\n`, 'FILE: line 2: a skill outside a repository'],
    [`${header}\n${repo}\n{"type":"note"}\n`, 'FILE: line 3: unknown record type "note"'],
    [`${header}\n${repo.replace('"name":"b"', '"name":1')}\n${skill}\n`, 'FILE: line 2: "name" must be a string'],
    [`${header}\n${repo}\n${skill.replace('"links":[', '"links":[1,')}\n`, 'FILE: line 3: every link must be an object'],
    [`${header}\n${repo}\n`, 'FILE: line 2: expected 1 skills for the repository above, found 0'],
    [`${header}\n${repo.replace('"skills":1', '"skills":null')}\n${skill}\n`, 'FILE: line 3: a skill of a repository that was not scanned'],
    [`${header}\n${repo}\n${skill}\n{"type":"warning","text":"w"}\n${repo}\n`, 'FILE: line 5: a repository after the warnings'],
    [header.replace('"repositories":1', '"repositories":2') + `\n${repo}\n${skill}\n`, 'FILE: expected 2 repositories, found 1; the file is incomplete'],
  ];
  for (const [index, [text, message]] of cases.entries()) {
    const file = join(directory, `${index}.txt`);
    writeFileSync(file, text);
    const loaded = await atlas(['load', file]);
    assert.equal(loaded.code, 1, text);
    assert.equal(loaded.stdout, '', text);
    assert.equal(loaded.stderr, (message as string).replaceAll('FILE', file), text);
  }
  const valid = join(directory, 'valid.txt');
  writeFileSync(valid, `${header}\n${repo}\n${skill}\n{"type":"warning","text":"w"}\n`);
  assert.deepEqual(await atlas(['load', valid]), { code: 0, stdout: 'a/b · 1 skill\ns\n  u', stderr: 'warning: w' });

  const unreadable = await atlas(['load', join(directory, 'no-such-file.txt')]);
  assert.equal(unreadable.code, 1);
  assert.match(unreadable.stderr, /^Cannot read .*no-such-file\.txt: ENOENT/);
});
