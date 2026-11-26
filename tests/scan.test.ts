// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('with a token, a private repository\'s files are read with it', async () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const recorded = replay({
    'https://api.github.com/repos/acme/secret': { status: 200, body: { full_name: 'acme/secret', default_branch: 'main' } },
    'https://api.github.com/repos/acme/secret/commits/main': { status: 200, body: { sha: commit } },
    [`https://api.github.com/repos/acme/secret/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'b' }] },
    },
    [`https://raw.githubusercontent.com/acme/secret/${commit}/SKILL.md`]: { status: 200, body: '---\nname: secret\n---\n' },
  });
  // A private repository: not found without the token, on the API and on raw.githubusercontent.com alike.
  const fetch: typeof recorded = async (url, init) => init?.headers?.Authorization === 'Bearer t'
    ? recorded(url, init)
    : new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  const result = await scan(await openGitHub('https://github.com/acme/secret', { fetch, token: 't' }));
  assert.deepEqual(result.skills.map((skill) => skill.name), ['secret']);
  assert.deepEqual(result.warnings, []);
});

test('token refused for SAML SSO → the public repository scans without it', async () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const recorded = replay({
    'https://api.github.com/repos/JetBrains/android': { status: 200, body: { full_name: 'JetBrains/android', default_branch: 'master' } },
    'https://api.github.com/repos/JetBrains/android/commits/master': { status: 200, body: { sha: commit } },
    [`https://api.github.com/repos/JetBrains/android/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: 'skills/build/SKILL.md', mode: '100644', type: 'blob', sha: 'b' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/android/${commit}/skills/build/SKILL.md`]: {
      status: 200,
      body: '---\nname: build\ndescription: Build it.\n---\n',
    },
  });
  // What GitHub answers to a token that is not authorized for the organization's SAML SSO.
  const withToken: string[] = [];
  const sso: typeof recorded = async (url, init) => {
    if (init?.headers?.Authorization) {
      withToken.push(url);
      return new Response(JSON.stringify({ message: 'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.' }), { status: 403 });
    }
    return recorded(url, init);
  };
  const result = await scan(await openGitHub('https://github.com/JetBrains/android', { fetch: sso, token: 'not-authorized' }));
  assert.deepEqual(result.skills.map((skill) => [skill.name, skill.links[0].url]), [
    ['build', `https://github.com/JetBrains/android/blob/${commit}/skills/build/SKILL.md`],
  ]);
  assert.deepEqual(result.warnings, []);
  // Refused once; every later request goes without the token.
  assert.deepEqual(withToken, ['https://api.github.com/repos/JetBrains/android']);

  // A private repository is not found without the token either.
  const privateRepo: typeof recorded = async (url, init) => new Response(
    JSON.stringify({ message: init?.headers?.Authorization ? 'Resource protected by organization SAML enforcement.' : 'Not Found' }),
    { status: init?.headers?.Authorization ? 403 : 404 },
  );
  await assert.rejects(openGitHub('https://github.com/JetBrains/secret', { fetch: privateRepo, token: 'not-authorized' }), {
    message: "Repository not found: https://github.com/JetBrains/secret; if it is private, authorize GITHUB_TOKEN for the organization's SAML SSO",
  });

  // Without the token, the lower rate limit applies: say why the token is not used.
  const limited: typeof recorded = async (url, init) => new Response(
    JSON.stringify({ message: init?.headers?.Authorization ? 'Resource protected by organization SAML enforcement.' : 'API rate limit exceeded for 192.0.2.1.' }),
    { status: 403 },
  );
  await assert.rejects(openGitHub('https://github.com/JetBrains/android', { fetch: limited, token: 'not-authorized' }), {
    message: "GitHub rate limit reached; authorize GITHUB_TOKEN for the organization's SAML SSO",
  });
});
