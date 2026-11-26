// The decisions in spec/action.md: the workflow's own script, run against a local server that
// stands in for the Air automation gateway.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { parse } from 'yaml';

const SOURCE = readFileSync(new URL('../.github/workflows/issue-comment.yml', import.meta.url), 'utf8');
const workflow = parse(SOURCE);
const job = workflow.jobs.notify;
const [step] = job.steps;
const GATEWAY = 'https://api.jetbrains.cloud/air-automations-gateway/api/v1/events/automations/a042fce6-99f4-4b00-a952-609d6ef6727c';
const PAYLOAD = '{"action":"created","comment":{"body":"$(touch pwned) `id` \\"quoted\\"","user":{"type":"User"}}}\n';

type Received = { method?: string; url?: string; headers: IncomingMessage['headers']; body: string };

/** Runs the step's script as the runner would, with a local gateway answering `status`. */
async function runStep(t: TestContext, { key, status = 200 }: { key: string; status?: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-comment-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const event = join(dir, 'event.json');
  writeFileSync(event, PAYLOAD);

  const received: Received[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      received.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.writeHead(status, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const child = spawn('bash', ['-e', '-c', step.run], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      GITHUB_EVENT_PATH: event,
      AIR_AUTOMATION_URL: `http://127.0.0.1:${port}/air-automations-gateway/api/v1/events/automations/test`,
      AIR_AUTOMATION_API_KEY: key,
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { code, output, received, dir };
}

test('the workflow listens for issue_comment events and skips bots', () => {
  assert.deepEqual(workflow.on, { issue_comment: { types: ['created', 'edited', 'deleted'] } });
  assert.equal(job.if, "github.event.comment.user.type != 'Bot'");
  assert.deepEqual(workflow.permissions, {});
});

test('the request goes to the automation, with the key from the secret only', () => {
  assert.equal(step.env.AIR_AUTOMATION_URL, GATEWAY);
  assert.equal(step.env.AIR_AUTOMATION_API_KEY, '${{ secrets.AIR_AUTOMATION_API_KEY }}');
  assert.doesNotMatch(SOURCE, /aira_/);
  // The comment text never reaches the script itself.
  assert.doesNotMatch(SOURCE, /github\.event\.comment\.body/);
});

test('each event → one POST with the API key, JSON and the payload byte for byte', async (t) => {
  const { code, output, received, dir } = await runStep(t, { key: 'test-key' });
  assert.equal(code, 0, output);
  assert.equal(received.length, 1);
  const [request] = received;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/air-automations-gateway/api/v1/events/automations/test');
  assert.equal(request.headers.authorization, 'ApiKey test-key');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.body, PAYLOAD);
  assert.throws(() => readFileSync(join(dir, 'pwned')));
});

test('a missing secret → the job fails with a message, nothing is sent', async (t) => {
  const { code, output, received } = await runStep(t, { key: '' });
  assert.equal(code, 1);
  assert.match(output, /::error::Set the AIR_AUTOMATION_API_KEY repository secret/);
  assert.equal(received.length, 0);
});

test('an error response → the job fails', async (t) => {
  const { code } = await runStep(t, { key: 'wrong', status: 401 });
  assert.notEqual(code, 0);
});
