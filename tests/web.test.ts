// The decisions in spec/web.md, checked over HTTP against a server answered by tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { replay } from '../src/core/replay.ts';
import type { Fetch } from '../src/core/github.ts';
import { createWebServer } from '../src/web/server.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

async function serve(t: TestContext, fetch: Fetch = github, token?: string): Promise<string> {
  const server = createWebServer({ fetch, token });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const scan = (base: string, repo: string) => fetch(`${base}/api/scan?repo=${encodeURIComponent(repo)}`);

test('GET / → the page with a repository link input', async (t) => {
  const response = await fetch(await serve(t));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const page = await response.text();
  assert.match(page, /<input id="repo"[^>]*type="url"/);
  assert.match(page, /<button type="submit">Scan<\/button>/);
  assert.match(page, /fetch\('\/api\/scan\?repo='/);
  // Repository text goes in as text only.
  assert.doesNotMatch(page, /innerHTML/);
});

test('GET /api/scan → the scan result as JSON: repository, skills with all links, warnings', async (t) => {
  const response = await scan(await serve(t), 'https://github.com/JetBrains/example');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    repository: {
      id: 'JetBrains/example',
      organization: 'JetBrains',
      name: 'example',
      url: 'https://github.com/JetBrains/example',
      commit: EXAMPLE_COMMIT,
    },
    skills: [{
      id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
      content: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
      name: 'commits',
      description: 'Write commit messages the way this repository does. Use for every commit.',
      links: [{
        repository: 'JetBrains/example',
        path: '.claude/skills/commits/SKILL.md',
        url: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
        commit: EXAMPLE_COMMIT,
      }],
    }],
    warnings: [],
  });
});

test('not a GitHub repository URL, or a local directory → 400 and the reason', async (t) => {
  const base = await serve(t);
  for (const repo of [FIXTURE, 'https://gitlab.com/owner/repo', '']) {
    const response = await scan(base, repo);
    assert.equal(response.status, 400, repo);
    assert.deepEqual(await response.json(), { error: `Not a GitHub repository URL: ${repo}` });
  }
});

test('missing, unreachable or rate-limited repository → 502 and the CLI message', async (t) => {
  const base = await serve(t, replay({
    'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } },
    'https://api.github.com/repos/JetBrains/MPS': { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  }));
  const cases = {
    'https://github.com/JetBrains/no-such-repository': 'Repository not found: https://github.com/JetBrains/no-such-repository',
    'https://github.com/JetBrains/MPS': 'GitHub rate limit reached; set GITHUB_TOKEN',
    'https://github.com/JetBrains/not-answered': 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered',
  };
  for (const [repo, error] of Object.entries(cases)) {
    const response = await scan(base, repo);
    assert.equal(response.status, 502, repo);
    assert.deepEqual(await response.json(), { error });
  }
});

test('unknown path → 404; other methods → 405', async (t) => {
  const base = await serve(t);
  assert.equal((await fetch(`${base}/etc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/api/scan`, { method: 'POST' })).status, 405);
});

test('./skill-atlas serve <port> starts the web view on localhost and prints its address', async (t) => {
  const child = spawn(process.execPath, [CLI, 'serve', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const address = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      const match = /^Skill Atlas web view: (http:\/\/localhost:\d+)\n/.exec(text);
      if (match) resolve(match[1]);
    });
    child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
  });
  const page = await fetch(address.replace('localhost', '127.0.0.1'));
  assert.equal(page.status, 200);
});

test('serve with a bad port → usage, exit code 1', async () => {
  const bad = spawnSync(process.execPath, [CLI, 'serve', 'abc'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr, 'Usage: skill-atlas serve [port]\n');
});
