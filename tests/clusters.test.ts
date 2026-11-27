// Clusters in spec/web.md: the saved skills grouped by the words they share, over HTTP and in the
// page itself, run against the server with a minimal DOM.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createWebServer } from '../src/web/server.ts';
import { github } from './helpers.ts';

const DATA = fileURLToPath(new URL('../data/jetbrainsSkills.txt', import.meta.url));

/**
 * Every case of the file format and the heuristic: a CRLF line, padding around the name and the
 * description, a description holding a `:`, a blank line, a line without `:`, words in another case,
 * a word repeated in one skill, and words too short or too common to count.
 */
const SAVED = [
  "review-code: Review a pull request's code.",
  'code-style: Format the CODE.\r',
  '   release :   Draft release notes: version two.   ',
  'notes-app: Take notes in the app.',
  'lonely: Kotlin, kotlin and KOTLIN.',
  '',
  'gradle: Build the plugin.',
  'alpha: Works with the API skill.',
  'refactor: Clean up code.',
  'standalone',
  'omega: Talks with any API skill.',
  'maven: Build the jar.',
  '',
].join('\n');

const skill = (name: string, description = '') => ({ name, description });

/** A server whose saved skills are `text`, or the given file. */
async function serve(t: TestContext, saved: { text?: string; file?: string } = {}): Promise<string> {
  let savedSkills = saved.file;
  if (saved.text !== undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'clusters-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    savedSkills = join(directory, 'skills.txt');
    writeFileSync(savedSkills, saved.text);
  }
  const server = createWebServer({ fetch: github, token: 'test', savedSkills });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

type Saved = { name: string; description: string };
type Clusters = { source: string; total: number; clusters: { word: string; skills: Saved[] }[]; unclustered: Saved[] };

test('GET /api/clusters → the most shared word first, ties by code point, skills once each in file order, the rest unclustered', async (t) => {
  const response = await fetch(`${await serve(t, { text: SAVED })}/api/clusters`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(await response.json(), {
    source: 'data/jetbrainsSkills.txt',
    total: 11,
    clusters: [
      // code: 3 skills, CODE in another case; build and notes: 2 each, build first.
      { word: 'code', skills: [skill('review-code', "Review a pull request's code."), skill('code-style', 'Format the CODE.'), skill('refactor', 'Clean up code.')] },
      { word: 'build', skills: [skill('gradle', 'Build the plugin.'), skill('maven', 'Build the jar.')] },
      { word: 'notes', skills: [skill('release', 'Draft release notes: version two.'), skill('notes-app', 'Take notes in the app.')] },
    ],
    // lonely repeats kotlin alone; alpha and omega share only with, skill and API; standalone has no description.
    unclustered: [
      skill('lonely', 'Kotlin, kotlin and KOTLIN.'),
      skill('alpha', 'Works with the API skill.'),
      skill('standalone'),
      skill('omega', 'Talks with any API skill.'),
    ],
  });
});

test('GET /api/clusters → a skill already in a cluster is not counted for the next word', async (t) => {
  // java: 4 skills beats tool: 3, and takes a, b and c with it: nothing is left to share tool.
  const text = 'a: tool java\nb: tool java\nc: tool java\nd: java\n';
  const result = (await (await fetch(`${await serve(t, { text })}/api/clusters`)).json()) as Clusters;
  assert.deepEqual(result.clusters.map((cluster) => [cluster.word, cluster.skills.map((s) => s.name)]), [['java', ['a', 'b', 'c', 'd']]]);
  const tool = (await (await fetch(`${await serve(t, { text: 'a: tool java\nb: tool java\nc: tool\nd: java\n' })}/api/clusters`)).json()) as Clusters;
  // java and tool: 3 each, java first; then c alone with tool.
  assert.deepEqual(tool.clusters.map((cluster) => [cluster.word, cluster.skills.map((s) => s.name)]), [['java', ['a', 'b', 'd']]]);
  assert.deepEqual(tool.unclustered.map((s) => s.name), ['c']);
});

test('GET /api/clusters → an empty file: no skills, no clusters', async (t) => {
  const result = await (await fetch(`${await serve(t, { text: '\n\n' })}/api/clusters`)).json();
  assert.deepEqual(result, { source: 'data/jetbrainsSkills.txt', total: 0, clusters: [], unclustered: [] });
});

test('GET /api/clusters → a missing file is a 500 with the reason', async (t) => {
  const response = await fetch(`${await serve(t, { file: join(tmpdir(), 'no-such-dir-clusters', 'skills.txt') })}/api/clusters`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Cannot read data/jetbrainsSkills.txt: ENOENT' });
});

test('GET /api/clusters → by default, data/jetbrainsSkills.txt: every saved skill exactly once', async (t) => {
  const response = await fetch(`${await serve(t)}/api/clusters`);
  assert.equal(response.status, 200);
  const result = (await response.json()) as Clusters;
  const lines = readFileSync(DATA, 'utf8').split('\n').filter((line) => line.trim());
  assert.ok(lines.length > 0);
  assert.equal(result.total, lines.length);
  const seen = [...result.clusters.flatMap((cluster) => cluster.skills), ...result.unclustered];
  assert.equal(seen.length, lines.length);
  assert.ok(result.clusters.length > 1, 'more than one cluster');
  for (const cluster of result.clusters) assert.ok(cluster.skills.length >= 2, cluster.word);
  // Most shared first.
  const sizes = result.clusters.map((cluster) => cluster.skills.length);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});

test('GET / → a Clasterize button next to the link form, and a hidden clusters section with Hide over the scan result', async (t) => {
  const html = await (await fetch(await serve(t, { text: SAVED }))).text();
  assert.match(html, /<\/form>\n<button id="clusterize" type="button">Clasterize<\/button>\n<\/div>\n<section id="clusters"[^>]*hidden>/);
  assert.match(html, /<section id="clusters"[\s\S]*<button id="clusters-hide" type="button">Hide<\/button>[\s\S]*<\/section>\n<div id="status" role="status">/);
});

/** A tiny DOM: just what the page's script uses. */
class Node {
  textContent = '';
  className = '';
  hidden = false;
  disabled = false;
  value = '';
  title = '';
  href = '';
  target = '';
  rel = '';
  type = '';
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

/** The served page's script against the server, as a user clicking its buttons sees it. */
async function open(base: string) {
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
  nodes.clusters.hidden = true;
  const requested: string[] = [];
  let whileLoading: { status: string; disabled: boolean; hidden: boolean } | undefined;
  let done!: Promise<unknown>;
  runInNewContext(script, {
    URL,
    document: { getElementById: (id: string) => nodes[id], createElement: (tag: string) => new Node(tag) },
    fetch: (path: string) => {
      requested.push(path);
      whileLoading = { status: nodes['clusters-status'].textContent, disabled: nodes.clusterize.disabled, hidden: nodes.clusters.hidden };
      return (done = fetch(base + path));
    },
  });
  const click = async (id: string) => { await nodes[id].listeners.click({ preventDefault() {} }); };
  const scan = async (repo: string) => {
    nodes.repo.value = repo;
    await nodes.form.listeners.submit({ preventDefault() {} });
    await done;
  };
  const seen = () => ({
    hidden: nodes.clusters.hidden,
    status: nodes['clusters-status'].textContent,
    error: nodes['clusters-status'].className === 'error',
    groups: nodes['cluster-list'].children.map((box) => [box.children[0].textContent, ...box.children[1].children.map((item) => item.textContent)]),
  });
  return { nodes, requested, click, scan, seen, loading: () => whileLoading };
}

const SHOWN = {
  hidden: false,
  status: '11 skills · 3 clusters',
  error: false,
  groups: [
    ['code · 3 skills', 'review-code', 'code-style', 'refactor'],
    ['build · 2 skills', 'gradle', 'maven'],
    ['notes · 2 skills', 'release', 'notes-app'],
    ['Unclustered · 4 skills', 'lonely', 'alpha', 'standalone', 'omega'],
  ],
};

test('page: Clasterize shows the clusters, Clustering… while it reads; descriptions on hover; nothing is scanned', async (t) => {
  const { nodes, requested, click, seen, loading } = await open(await serve(t, { text: SAVED }));
  assert.equal(nodes.clusters.hidden, true);
  await click('clusterize');
  assert.deepEqual(requested, ['/api/clusters']);
  assert.deepEqual(loading(), { status: 'Clustering…', disabled: true, hidden: false });
  assert.equal(nodes.clusterize.disabled, false);
  assert.deepEqual(seen(), SHOWN);
  const first = nodes['cluster-list'].children[0].children[1].children[0];
  assert.equal(first.title, "Review a pull request's code.");
  // The skills are text, never HTML.
  assert.equal(first.tag, 'li');
});

test('page: Hide hides the whole section; Clasterize reads the file again and shows it', async (t) => {
  const { requested, click, seen } = await open(await serve(t, { text: SAVED }));
  await click('clusterize');
  await click('clusters-hide');
  assert.equal(seen().hidden, true);
  await click('clusterize');
  assert.deepEqual(requested, ['/api/clusters', '/api/clusters']);
  assert.deepEqual(seen(), SHOWN);
});

test('page: one cluster and every skill in it → 1 cluster and no Unclustered group', async (t) => {
  const { click, seen } = await open(await serve(t, { text: 'a: gradle build\nb: maven build\n' }));
  await click('clusterize');
  assert.deepEqual(seen(), { hidden: false, status: '2 skills · 1 cluster', error: false, groups: [['build · 2 skills', 'a', 'b']] });
});

test('page: a file that cannot be read → its message in the section', async (t) => {
  const { nodes, click, seen } = await open(await serve(t, { file: join(tmpdir(), 'no-such-dir-clusters', 'skills.txt') }));
  await click('clusterize');
  assert.deepEqual(seen(), { hidden: false, status: 'Cannot read data/jetbrainsSkills.txt: ENOENT', error: true, groups: [] });
  assert.equal(nodes.clusterize.disabled, false);
});

test('page: a scan leaves the clusters as they are', async (t) => {
  const { nodes, click, scan, seen } = await open(await serve(t, { text: SAVED }));
  await click('clusterize');
  await scan('https://github.com/JetBrains/example');
  assert.equal(nodes.status.textContent, 'JetBrains/example · 1 skill');
  assert.deepEqual(seen(), SHOWN);
});
