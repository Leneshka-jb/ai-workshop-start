// The decisions in spec/web.md, checked over HTTP against a server answered by tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { connect, type AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { replay } from '../src/core/replay.ts';
import type { Fetch } from '../src/core/github.ts';
import { createWebServer } from '../src/web/server.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

async function serve(t: TestContext, fetch: Fetch = github, token?: string, allowedHosts?: string[]): Promise<string> {
  const server = createWebServer({ fetch, token, allowedHosts });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Starts `./skill-atlas serve 0` and returns its address; fails at once if the process exits first. */
function startServe(t: TestContext, env: NodeJS.ProcessEnv = process.env): Promise<{ address: string; exited: () => boolean }> {
  const child = spawn(process.execPath, [CLI, 'serve', '0'], { stdio: ['ignore', 'pipe', 'pipe'], env });
  t.after(() => child.kill());
  let exited = false;
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text: string) => { stderr += text; });
  return new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      const match = /^Skill Atlas web view: (http:\/\/localhost:\d+)\n/.exec(text);
      if (match) resolve({ address: match[1], exited: () => exited });
    });
    child.once('exit', (code) => { exited = true; reject(new Error(`serve exited with ${code}: ${stderr}`)); });
  });
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

test('GET / → on a narrow screen every table row is a block of its cells, labelled, so the page never scrolls sideways', async (t) => {
  const page = await (await fetch(await serve(t))).text();
  const narrow = /@media \(max-width: 40rem\) \{\n([^]*?)\n  \}\n/.exec(page);
  assert.ok(narrow, 'a rule for screens under 40rem');
  const rules = narrow[1].split('\n').map((line) => line.trim());
  assert.ok(rules.includes('table, tbody, tr, td { display: block; }'));
  assert.ok(rules.includes('thead { display: none; }'));
  assert.ok(rules.includes('td, td.links, td.action { width: auto; padding: .15rem 0; border-bottom: 0; }'));
  assert.ok(rules.includes('td.description:empty { display: none; }'));
  assert.ok(rules.includes('td.description::before { content: "Description"; }'));
  assert.ok(rules.includes('td.links::before { content: "Links"; margin-bottom: .15rem; }'));
  // Under 64rem a long name wraps; a link label breaks only where it must, at any width.
  assert.match(page, /^  @media \(max-width: 64rem\) \{ td\.name \{ white-space: normal; overflow-wrap: anywhere; \} \}$/m);
  assert.match(page, /^  td\.links a \{[^}]*overflow-wrap: anywhere; \}$/m);
  assert.doesNotMatch(page, /word-break: break-all/);
  // The hidden table stays hidden on a narrow screen: the id rule outranks the block display.
  assert.match(page, /#table\[hidden\] \{ display: none; \}/);
});

test('GET /api/scan → the scan result as JSON: repository, skills with all links, total, warnings', async (t) => {
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
    total: 1,
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
  const { address } = await startServe(t);
  const page = await fetch(address.replace('localhost', '127.0.0.1'));
  assert.equal(page.status, 200);
});

test('serve with a bad port → usage, exit code 1', async () => {
  const bad = spawnSync(process.execPath, [CLI, 'serve', 'abc'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr, 'Usage: skill-atlas serve [port]\n');
});

/** Sends raw bytes and returns the status line of the answer, or '' if the connection closes without one. */
function raw(base: string, request: string): Promise<string> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    let answer = '';
    const socket = connect(Number(port), hostname, () => socket.write(request));
    socket.setEncoding('utf8').on('data', (text: string) => { answer += text; });
    socket.on('error', reject).on('close', () => resolve(answer.split('\r\n')[0]));
    socket.setTimeout(2000, () => socket.end());
  });
}

test('an unreadable request URL → 400, and the server keeps answering', async (t) => {
  const base = await serve(t);
  assert.equal(await raw(base, `GET http://[ HTTP/1.1\r\nHost: ${new URL(base).host}\r\nConnection: close\r\n\r\n`), 'HTTP/1.1 400 Bad Request');
  assert.equal((await fetch(base)).status, 200);
});

test('an unexpected error → 500, and the server keeps answering', async (t) => {
  // GitHub answers 200 with a body that is not JSON.
  const base = await serve(t, replay({ 'https://api.github.com/repos/JetBrains/broken': { status: 200, body: 'not json' } }));
  const response = await scan(base, 'https://github.com/JetBrains/broken');
  assert.equal(response.status, 500);
  assert.match(((await response.json()) as { error: string }).error, /^Unexpected error: /);
  assert.equal((await fetch(base)).status, 200);
});

test('./skill-atlas serve survives an unreadable request URL', async (t) => {
  const started = await startServe(t);
  const address = started.address.replace('localhost', '127.0.0.1');
  assert.equal(await raw(address, `GET http://[ HTTP/1.1\r\nHost: ${new URL(address).host}\r\nConnection: close\r\n\r\n`), 'HTTP/1.1 400 Bad Request');
  assert.equal((await fetch(address)).status, 200);
  assert.equal(started.exited(), false);
});

/** A GET with the given Host header, which fetch does not let a caller set. */
function withHost(base: string, path: string, host?: string): Promise<string> {
  return raw(base, `GET ${path} HTTP/1.1\r\n${host === undefined ? '' : `Host: ${host}\r\n`}Connection: close\r\n\r\n`);
}

test('DNS rebinding: a Host other than this server → 421, before any scan', async (t) => {
  const asked: string[] = [];
  const base = await serve(t, async (url, init) => { asked.push(url); return github(url, init); }, 'secret-token');
  const { port } = new URL(base);
  for (const host of ['attacker.example', `attacker.example:${port}`, '127.0.0.1', `localhost:${Number(port) + 1}`, 'localhost.attacker.example:' + port]) {
    assert.equal(await withHost(base, '/', host), 'HTTP/1.1 421 Misdirected Request', host);
    assert.equal(await withHost(base, '/api/scan?repo=github.com/JetBrains/example', host), 'HTTP/1.1 421 Misdirected Request', host);
  }
  // HTTP/1.0 without a Host header.
  assert.equal(await raw(base, 'GET / HTTP/1.0\r\n\r\n'), 'HTTP/1.1 421 Misdirected Request');
  assert.deepEqual(asked, []);

  for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `LOCALHOST:${port}`]) {
    assert.equal(await withHost(base, '/api/scan?repo=github.com/JetBrains/example', host), 'HTTP/1.1 200 OK', host);
  }
});

test('an allowed host, such as a Codespace forwarded address, is answered', async (t) => {
  const base = await serve(t, github, undefined, ['my-codespace-3000.app.github.dev']);
  assert.equal(await withHost(base, '/', 'my-codespace-3000.app.github.dev'), 'HTTP/1.1 200 OK');
  assert.equal(await withHost(base, '/', 'other-codespace-3000.app.github.dev'), 'HTTP/1.1 421 Misdirected Request');
});

test('./skill-atlas serve in a Codespace accepts its forwarded address, and only that', async (t) => {
  const { address: started } = await startServe(t, { ...process.env, CODESPACE_NAME: 'my-codespace', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' });
  const address = started.replace('localhost', '127.0.0.1');
  const { port } = new URL(address);
  assert.equal(await withHost(address, '/', `my-codespace-${port}.app.github.dev`), 'HTTP/1.1 200 OK');
  assert.equal(await withHost(address, '/', `localhost:${port}`), 'HTTP/1.1 200 OK');
  assert.equal(await withHost(address, '/', `other-codespace-${port}.app.github.dev`), 'HTTP/1.1 421 Misdirected Request');
  assert.equal(await withHost(address, '/', 'attacker.example'), 'HTTP/1.1 421 Misdirected Request');
});
