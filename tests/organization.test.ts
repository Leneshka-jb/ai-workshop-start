// The organization decisions in spec/analysis.md and spec/web.md, checked over HTTP against a
// server whose GitHub answers come from recordings.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { PAGE } from '../src/web/page.ts';
import { createWebServer } from '../src/web/server.ts';
import { github } from './helpers.ts';

const API = 'https://api.github.com';
const SHA = '1111111111111111111111111111111111111111';
const SKILL = '---\nname: review\ndescription: Review a pull request.\n---\n';

async function serve(t: TestContext, fetch: Fetch, token?: string): Promise<string> {
  const server = createWebServer({ fetch, token });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const organization = (base: string, org: string) => fetch(`${base}/api/organization?org=${encodeURIComponent(org)}`);

/** A repository at SHA whose tree holds the given files, all readable. */
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

// Acme: three repositories, listed out of order; one with a skill in two places, one with a
// malformed skill next to a good one, and one empty.
const ACME: Recording = {
  [`${API}/users/acme`]: { status: 200, body: { login: 'Acme', type: 'Organization' } },
  [`${API}/orgs/Acme/repos?type=all&per_page=100&page=1`]: {
    status: 200,
    body: [info('Acme/tools'), info('Acme/empty'), info('Acme/agents'), info('Acme/Zeta')],
  },
  ...repository('Acme/agents', { '.claude/skills/review/SKILL.md': SKILL, '.agents/skills/review/SKILL.md': SKILL }),
  ...repository('Acme/tools', { 'skills/a/SKILL.md': SKILL, 'skills/broken/SKILL.md': '---\na: b: c\n---\n', 'README.md': '' }),
  ...repository('Acme/Zeta', { 'README.md': '' }),
  [`${API}/repos/Acme/empty/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
};

test('GET /api/organization → every repository, sorted, with its number of unique skills', async (t) => {
  const response = await organization(await serve(t, replay(ACME)), 'https://github.com/acme');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    organization: { id: 'Acme', url: 'https://github.com/Acme' },
    repositories: [
      { id: 'Acme/Zeta', name: 'Zeta', url: 'https://github.com/Acme/Zeta', skills: 0 },
      { id: 'Acme/agents', name: 'agents', url: 'https://github.com/Acme/agents', skills: 1 },
      { id: 'Acme/empty', name: 'empty', url: 'https://github.com/Acme/empty', skills: null },
      { id: 'Acme/tools', name: 'tools', url: 'https://github.com/Acme/tools', skills: 2 },
    ],
    warnings: [
      `Acme/empty: GitHub answered 409 for ${API}/repos/Acme/empty/commits/main: Git Repository is empty.; not scanned`,
      'Acme/tools: skills/broken/SKILL.md: malformed front matter: Nested mappings are not allowed in compact mappings at line 2, column 4; using the directory name',
    ],
  });
});

test('skills are not grouped across repositories: the same SKILL.md counts in each', async (t) => {
  const response = await organization(await serve(t, replay({
    [`${API}/users/twins`]: { status: 200, body: { login: 'twins', type: 'Organization' } },
    [`${API}/orgs/twins/repos?type=all&per_page=100&page=1`]: { status: 200, body: [info('twins/a'), info('twins/b')] },
    ...repository('twins/a', { 'SKILL.md': SKILL }),
    ...repository('twins/b', { 'SKILL.md': SKILL }),
  })), 'github.com/twins/');
  assert.equal(response.status, 200);
  const result = (await response.json()) as { repositories: { id: string; skills: number }[] };
  assert.deepEqual(result.repositories.map(({ id, skills }) => [id, skills]), [['twins/a', 1], ['twins/b', 1]]);
});

test('a user account lists the repositories it owns', async (t) => {
  const response = await organization(await serve(t, replay({
    [`${API}/users/someone`]: { status: 200, body: { login: 'someone', type: 'User' } },
    [`${API}/users/someone/repos?type=owner&per_page=100&page=1`]: { status: 200, body: [info('someone/notes')] },
    ...repository('someone/notes', { 'SKILL.md': SKILL }),
  })), 'https://github.com/someone');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    organization: { id: 'someone', url: 'https://github.com/someone' },
    repositories: [{ id: 'someone/notes', name: 'notes', url: 'https://github.com/someone/notes', skills: 1 }],
    warnings: [],
  });
});

test('repositories are listed page by page until the last', async (t) => {
  const ids = Array.from({ length: 101 }, (_, index) => `big/r${String(index).padStart(3, '0')}`);
  const recording: Recording = {
    [`${API}/users/big`]: { status: 200, body: { login: 'big', type: 'Organization' } },
    [`${API}/orgs/big/repos?type=all&per_page=100&page=1`]: { status: 200, body: ids.slice(0, 100).map(info) },
    [`${API}/orgs/big/repos?type=all&per_page=100&page=2`]: { status: 200, body: ids.slice(100).map(info) },
  };
  for (const id of ids) Object.assign(recording, repository(id, { 'SKILL.md': SKILL }));
  const response = await organization(await serve(t, replay(recording)), 'https://github.com/big');
  assert.equal(response.status, 200);
  const result = (await response.json()) as { repositories: { id: string; skills: number }[] };
  assert.deepEqual(result.repositories.map((repository) => repository.id), ids);
  assert.ok(result.repositories.every((repository) => repository.skills === 1));
});

test('a token refused for SAML SSO → the organization and its repositories are scanned without it', async (t) => {
  const recording: Recording = {
    [`${API}/orgs/sso/repos?type=all&per_page=100&page=1`]: { status: 200, body: [info('sso/a')] },
    ...repository('sso/a', { 'SKILL.md': SKILL }),
  };
  const asked: string[] = [];
  const fetch: Fetch = async (url, init) => {
    const authorized = Boolean(init?.headers?.Authorization);
    asked.push(`${authorized ? 'token' : 'anonymous'} ${url}`);
    if (url === `${API}/users/sso`) {
      return authorized
        ? new Response(JSON.stringify({ message: 'Resource protected by organization SAML enforcement.' }), { status: 403 })
        : new Response(JSON.stringify({ login: 'sso', type: 'Organization' }), { status: 200 });
    }
    if (authorized) throw new Error(`token sent after SAML refusal: ${url}`);
    return replay(recording)(url, init);
  };
  const response = await organization(await serve(t, fetch, 'secret'), 'https://github.com/sso');
  assert.equal(response.status, 200);
  const result = (await response.json()) as { repositories: { skills: number }[] };
  assert.deepEqual(result.repositories.map((repository) => repository.skills), [1]);
  assert.equal(asked.filter((line) => line.startsWith('token')).length, 1);
});

test('with a token, a private repository is listed and its files are read with the token', async (t) => {
  const recorded = replay({
    [`${API}/users/acme`]: { status: 200, body: { login: 'acme', type: 'Organization' } },
    [`${API}/orgs/acme/repos?type=all&per_page=100&page=1`]: { status: 200, body: [info('acme/secret')] },
    ...repository('acme/secret', { 'SKILL.md': SKILL }),
  });
  // What GitHub answers for a private repository: not found without the token.
  const fetch: Fetch = async (url, init) => init?.headers?.Authorization === 'Bearer t'
    ? recorded(url, init)
    : new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  const response = await organization(await serve(t, fetch, 't'), 'https://github.com/acme');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    organization: { id: 'acme', url: 'https://github.com/acme' },
    repositories: [{ id: 'acme/secret', name: 'secret', url: 'https://github.com/acme/secret', skills: 1 }],
    warnings: [],
  });
});

test('not an organization URL → 400; missing organization or GitHub unavailable → 502 and the message', async (t) => {
  const base = await serve(t, replay({
    [`${API}/users/nobody`]: { status: 404, body: { message: 'Not Found' } },
    [`${API}/users/limited`]: { status: 200, body: { login: 'limited', type: 'Organization' } },
    [`${API}/orgs/limited/repos?type=all&per_page=100&page=1`]: { status: 200, body: [info('limited/a'), info('limited/b')] },
    ...repository('limited/a', { 'SKILL.md': SKILL }),
    [`${API}/repos/limited/b/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  }));
  for (const org of ['https://github.com/JetBrains/example', 'https://gitlab.com/owner', '/etc', '']) {
    const response = await organization(base, org);
    assert.equal(response.status, 400, org);
    assert.deepEqual(await response.json(), { error: `Not a GitHub organization URL: ${org}` });
  }
  const cases = {
    'https://github.com/nobody': 'Organization not found: https://github.com/nobody',
    'https://github.com/limited': 'GitHub rate limit reached; set GITHUB_TOKEN',
    'https://github.com/unanswered': `Cannot reach GitHub: not recorded: ${API}/users/unanswered`,
  };
  for (const [org, error] of Object.entries(cases)) {
    const response = await organization(base, org);
    assert.equal(response.status, 502, org);
    assert.deepEqual(await response.json(), { error });
  }
});

test('the page sends an organization link to /api/organization and lists its repositories as text', async (t) => {
  const page = await (await fetch(await serve(t, github))).text();
  assert.match(page, /placeholder="https:\/\/github\.com\/owner\/repo or https:\/\/github\.com\/owner"/);
  assert.match(page, /fetch\('\/api\/organization\?org='/);
  assert.match(page, /pathname\.split\('\/'\)\.filter\(Boolean\)\.length === 1/);
  assert.match(page, /' repositories'/);
  assert.match(page, /'not scanned'/);
  assert.doesNotMatch(page, /innerHTML/);
});

/** Just enough DOM to run the page's script: elements by id, children, text and listeners. */
type Node = {
  tag: string; textContent: string; value: string; hidden: boolean; disabled: boolean; className: string;
  href?: string; type?: string; target?: string; rel?: string; children: Node[];
  listeners: Record<string, ((event: { preventDefault(): void }) => unknown)[]>;
  append(...nodes: Node[]): void; replaceChildren(...nodes: Node[]): void; querySelector(tag: string): Node;
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown): void; requestSubmit(): void;
};

function node(tag: string, ...children: Node[]): Node {
  const self: Node = {
    tag, textContent: '', value: '', hidden: false, disabled: false, className: '', children, listeners: {},
    append: (...nodes) => { self.children.push(...nodes); },
    replaceChildren: (...nodes) => { self.children = nodes; },
    querySelector: (wanted) => self.children.find((child) => child.tag === wanted)!,
    addEventListener: (type, listener) => { (self.listeners[type] ??= []).push(listener); },
    requestSubmit: () => { for (const listener of self.listeners.submit ?? []) submitted = listener({ preventDefault() {} }); },
  };
  return self;
}
let submitted: unknown;

/** Runs the served page's script against `api`, enters `input` and submits; returns the requests and the DOM. */
async function page(input: string, api: (url: string) => unknown) {
  const script = /<script>([\s\S]*)<\/script>/.exec(PAGE)![1];
  const elements: Record<string, Node> = {
    form: node('form', node('input'), node('button')),
    repo: node('input'),
    filter: node('input'),
    project: node('select'),
    status: node('div'),
    table: node('table'),
    columns: node('tr'),
    skills: node('tbody'),
    warnings: node('details', node('summary'), node('ul')),
    clusterize: node('button'),
    clusters: node('section'),
    'clusters-status': node('span'),
    'clusters-hide': node('button'),
    'cluster-list': node('div'),
  };
  const requested: string[] = [];
  runInNewContext(script, {
    URL,
    document: { getElementById: (id: string) => elements[id], createElement: (tag: string) => node(tag) },
    fetch: async (url: string) => {
      requested.push(url);
      return { ok: true, json: async () => api(url) };
    },
  });
  const submit = async () => { elements.form.requestSubmit(); await submitted; };
  elements.repo.value = input;
  await submit();
  return { requested, elements, submit };
}

const ORGANIZATION = {
  organization: { id: 'Acme', url: 'https://github.com/Acme' },
  repositories: [
    { id: 'Acme/agents', name: 'agents', url: 'https://github.com/Acme/agents', skills: 1 },
    { id: 'Acme/empty', name: 'empty', url: 'https://github.com/Acme/empty', skills: null },
  ],
  warnings: [],
};
const SCAN = { repository: { id: 'Acme/agents' }, skills: [], total: 0, warnings: [] };

test('the page: one path segment is an organization; anything else is scanned as a repository', async () => {
  const cases = {
    'https://github.com/Acme': '/api/organization?org=https%3A%2F%2Fgithub.com%2FAcme',
    'https://github.com/Acme/': '/api/organization?org=https%3A%2F%2Fgithub.com%2FAcme%2F',
    'https://github.com/Acme/agents': '/api/scan?repo=https%3A%2F%2Fgithub.com%2FAcme%2Fagents',
    'github.com/Acme': '/api/scan?repo=github.com%2FAcme',
  };
  for (const [input, request] of Object.entries(cases)) {
    const { requested } = await page(input, (url) => (url.startsWith('/api/organization') ? ORGANIZATION : SCAN));
    assert.deepEqual(requested, [request], input);
  }
});

test('the page: a repository\'s Scan button scans that repository; the filter shows for it, not for the organization', async () => {
  const { requested, elements } = await page('https://github.com/Acme', (url) => (url.startsWith('/api/organization') ? ORGANIZATION : SCAN));
  assert.equal(elements.status.textContent, 'Acme · 2 repositories');
  assert.equal(elements.filter.hidden, true, 'no filter for an organization');
  assert.equal(elements.project.hidden, true, 'no project selector for an organization');
  const rows = elements.skills.children;
  // A table row per repository: one cell each for the link, the count and the Scan button.
  assert.deepEqual(elements.columns.children.map((th) => th.textContent), ['Repository', 'Skills', '']);
  assert.deepEqual(rows.map((row) => row.children.map((td) => td.children[0].textContent)), [
    ['Acme/agents', '1 skill', 'Scan'],
    ['Acme/empty', 'not scanned', 'Scan'],
  ]);
  const button = rows[0].children[2].children[0];
  for (const listener of button.listeners.click) listener({ preventDefault() {} });
  await submitted; // the click submits the form
  assert.equal(elements.repo.value, 'https://github.com/Acme/agents');
  assert.equal(requested.at(-1), '/api/scan?repo=https%3A%2F%2Fgithub.com%2FAcme%2Fagents');
  assert.equal(elements.status.textContent, 'Acme/agents · No skills found');
  assert.equal(elements.filter.hidden, false, 'the filter, under the repository header');
});
