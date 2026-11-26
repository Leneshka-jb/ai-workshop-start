// The decisions in spec/action.md: the reply to an issue comment, with GitHub answering from
// tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseCommand, replyTo } from '../src/action/issue-comment.ts';
import { replay } from '../src/core/replay.ts';
import { EXAMPLE_COMMIT, FIXTURE, github } from './helpers.ts';

const options = { fetch: github, token: 'test' };
const MAIN = fileURLToPath(new URL('../src/action/main.ts', import.meta.url));
const WORKFLOW = readFileSync(new URL('../.github/workflows/issue-comment.yml', import.meta.url), 'utf8');

test('the workflow listens for created issue comments, from collaborators and not bots', () => {
  assert.match(WORKFLOW, /on:\n  issue_comment:\n    types: \[created\]/);
  assert.match(WORKFLOW, /\["OWNER", "MEMBER", "COLLABORATOR"\]/);
  assert.match(WORKFLOW, /user\.type != 'Bot'/);
  // The comment body only ever reaches the script through the environment.
  assert.deepEqual(WORKFLOW.match(/\$\{\{ github\.event\.comment\.body \}\}/g), ['${{ github.event.comment.body }}']);
  assert.match(WORKFLOW, /COMMENT_BODY: \$\{\{ github\.event\.comment\.body \}\}/);
});

test('only a first line starting with /scan is a command', async () => {
  assert.deepEqual(parseCommand('/scan https://github.com/JetBrains/example\nthanks'), ['https://github.com/JetBrains/example']);
  assert.equal(parseCommand('Looks good'), undefined);
  assert.equal(parseCommand('Please run\n/scan https://github.com/JetBrains/example'), undefined);
  assert.equal(parseCommand('/scanner'), undefined);
  assert.equal(await replyTo('Looks good', options), undefined);
});

test('/scan replies with the CLI output in a code block', async () => {
  const reply = await replyTo('/scan https://github.com/JetBrains/example', options);
  assert.equal(reply, [
    '```text',
    'JetBrains/example · 1 skill',
    'commits — Write commit messages the way this repository does.',
    `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    '```',
  ].join('\n'));
});

test('warnings go in a collapsed list below the result', async () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const fetch = replay({
    'https://api.github.com/repos/JetBrains/warned': { status: 200, body: { full_name: 'JetBrains/warned', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/warned/commits/main': { status: 200, body: { sha: commit } },
    [`https://api.github.com/repos/JetBrains/warned/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: 'broken/SKILL.md', mode: '100644', type: 'blob', sha: 'file' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/warned/${commit}/broken/SKILL.md`]: { status: 200, body: '---\nname: [unclosed\n---\n``` @someone\n' },
  });
  const reply = await replyTo('/scan https://github.com/JetBrains/warned', { fetch });
  assert.match(reply!, /^```text\nJetBrains\/warned · 1 skill\nbroken\n/);
  assert.match(reply!, /\n<details><summary>1 warning<\/summary>\n\n```text\nwarning: .*broken\/SKILL\.md.*\n```\n\n<\/details>$/s);
});

test('repository text never closes the code block', async () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const fetch = replay({
    'https://api.github.com/repos/JetBrains/fences': { status: 200, body: { full_name: 'JetBrains/fences', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/fences/commits/main': { status: 200, body: { sha: commit } },
    [`https://api.github.com/repos/JetBrains/fences/git/trees/${commit}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: 'x/SKILL.md', mode: '100644', type: 'blob', sha: 'file' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/fences/${commit}/x/SKILL.md`]: {
      status: 200,
      body: '---\nname: x\ndescription: "Ends ```` here. @someone"\n---\n',
    },
  });
  const reply = await replyTo('/scan https://github.com/JetBrains/fences', { fetch });
  assert.match(reply!, /^`````text\n[\s\S]*\n`````$/);
});

test('a local directory, a bad argument or an unreachable repository → the message', async () => {
  assert.equal(await replyTo(`/scan ${FIXTURE}`, options), `Skill Atlas could not scan:\n\n\`\`\`text\nNot a GitHub repository URL: ${FIXTURE}\n\`\`\``);
  assert.equal(await replyTo('/scan', options), 'Skill Atlas could not scan:\n\n```text\nUsage: /scan <GitHub URL>\n```');
  assert.equal(await replyTo('/scan a b', options), 'Skill Atlas could not scan:\n\n```text\nUsage: /scan <GitHub URL>\n```');
  assert.match(
    (await replyTo('/scan https://github.com/JetBrains/not-answered', options))!,
    /^Skill Atlas could not scan:\n\n```text\nCannot reach GitHub: not recorded: .*\n```$/,
  );
});

test('the entry point reads COMMENT_BODY and prints nothing for other comments', () => {
  const ignored = spawnSync(process.execPath, [MAIN], { encoding: 'utf8', env: { ...process.env, COMMENT_BODY: 'Looks good' } });
  assert.equal(ignored.status, 0, ignored.stderr);
  assert.equal(ignored.stdout, '');
  const local = spawnSync(process.execPath, [MAIN], { encoding: 'utf8', env: { ...process.env, COMMENT_BODY: `/scan ${FIXTURE}` } });
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stdout, /^Skill Atlas could not scan:/);
});
