// Builds the manual-QA report from <out>/*.json, publishes the videos and posts the report on the PR.
// Usage: node report.mjs --pr <n> [--sha <tested commit>] [--out /tmp/manual-qa/out] [--dry-run]
//   Videos and thumbnails are committed to the `qa-recordings` branch (orphan, only recordings) under
//   pr-<n>/<timestamp>/ and linked pinned to that commit. --dry-run writes report.md and posts nothing.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: {
  pr: { type: 'string' }, sha: { type: 'string' }, out: { type: 'string', default: '/tmp/manual-qa/out' },
  'dry-run': { type: 'boolean', default: false }, branch: { type: 'string', default: 'qa-recordings' },
} });
if (!args.pr && !args['dry-run']) throw new Error('--pr <n> is required (or --dry-run)');

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const OUT = args.out;
const results = readdirSync(OUT).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')));
if (!results.length) throw new Error(`no results in ${OUT}`);

const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
const sha = args.sha ?? run('git', ['rev-parse', 'HEAD'], { cwd: process.env.QA_ROOT ?? process.cwd() });
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

// A thumbnail per video: the frame a moment into the first failing case, or into the middle.
for (const r of results) {
  const firstFail = r.cases.find((c) => c.result === 'fail');
  r.thumbAt = firstFail ? firstFail.at + 2 : r.seconds / 2;
  r.thumb = join(OUT, `${r.script}.png`);
  try {
    run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(r.thumbAt), '-i', r.video, '-frames:v', '1', '-vf', 'scale=640:-1', r.thumb]);
  } catch { r.thumb = null; }
}

// Keep a copy as session artifacts, when running in Air.
if (process.env.AIR_ARTIFACTS_DIR) {
  const dir = join(process.env.AIR_ARTIFACTS_DIR, 'manual-qa', stamp);
  mkdirSync(dir, { recursive: true });
  for (const r of results) copyFileSync(r.video, join(dir, basename(r.video)));
}

// Publish the videos: commit them to the recordings branch, links pinned to that commit.
let base = null;
if (!args['dry-run']) {
  const dir = '/tmp/manual-qa/recordings';
  rmSync(dir, { recursive: true, force: true });
  const remote = `https://github.com/${repo}.git`;
  const exists = run('git', ['ls-remote', '--heads', remote, args.branch]) !== '';
  if (exists) run('git', ['clone', '--quiet', '--depth', '1', '--branch', args.branch, remote, dir]);
  else {
    run('git', ['init', '--quiet', '-b', args.branch, dir]);
    run('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
    writeFileSync(join(dir, 'README.md'), '# QA recordings\n\nVideos of manual-QA runs (the `manual-qa` skill), one directory per pull request and run. Not code.\n');
  }
  const target = join(dir, `pr-${args.pr}`, stamp);
  mkdirSync(target, { recursive: true });
  for (const r of results) {
    copyFileSync(r.video, join(target, basename(r.video)));
    if (r.thumb) copyFileSync(r.thumb, join(target, basename(r.thumb)));
  }
  run('git', ['-C', dir, 'add', '-A']);
  run('git', ['-C', dir, 'commit', '--quiet', '-m', `Manual QA of #${args.pr} at ${sha.slice(0, 7)}`]);
  run('git', ['-C', dir, 'push', '--quiet', 'origin', `HEAD:${args.branch}`]);
  const commit = run('git', ['-C', dir, 'rev-parse', 'HEAD']);
  base = `https://github.com/${repo}/blob/${commit}/pr-${args.pr}/${stamp}`;
}
const blob = (file) => (base ? `${base}/${basename(file)}` : basename(file));
const raw = (file) => blob(file).replace('/blob/', '/raw/');

// The report.
const all = results.flatMap((r) => r.cases.map((c) => ({ ...c, script: r.script, video: r.video })));
const count = (list, result) => list.filter((c) => c.result === result).length;
const failed = all.filter((c) => c.result === 'fail');
const verdict = failed.length ? '❌ Fail' : '✅ Pass';
const icon = { pass: '✅', fail: '❌', skip: '⏭️' };

const scriptLink = (r) => (r.source ? `[${r.script}](https://github.com/${repo}/blob/${sha}/${r.source})` : r.script);
const lines = [
  `## Manual QA: ${verdict}`,
  '',
  `${results.length} QA script${results.length === 1 ? '' : 's'} followed step by step in a browser at ${sha.slice(0, 7)}, each recorded.`,
  `**${all.length} cases: ${count(all, 'pass')} pass, ${failed.length} fail, ${count(all, 'skip')} skipped.**`,
  '',
  '| Script | Result | Pass | Fail | Skip | Video |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => `| ${scriptLink(r)} | ${count(r.cases, 'fail') ? icon.fail : icon.pass} `
    + `| ${count(r.cases, 'pass')} | ${count(r.cases, 'fail')} | ${count(r.cases, 'skip')} | [▶ ${mmss(r.seconds)}](${blob(r.video)}) |`),
];
const describe = (c) => [c.note, ...(c.notes ?? []).map((n) => `_${n}_`)].filter(Boolean).join(' — ');
if (failed.length) {
  lines.push('', '### Failures');
  for (const c of failed) lines.push(`- **${c.script} · ${c.id} ${c.title}** ([video](${blob(c.video)}) at ${mmss(c.at)}): ${describe(c)}`);
}
const skipped = all.filter((c) => c.result === 'skip');
if (skipped.length) {
  lines.push('', '### Not run');
  for (const c of skipped) lines.push(`- ${c.script} · ${c.id} ${c.title}: ${describe(c)}`);
}
lines.push('', '<details><summary>Every case</summary>', '');
for (const r of results) {
  lines.push(`**${r.script}**`, '');
  for (const c of r.cases) lines.push(`- ${icon[c.result]} ${c.id} ${c.title} (${mmss(c.at)}): ${describe(c)}`);
  lines.push('');
}
lines.push('</details>');
if (results.some((r) => r.thumb)) {
  lines.push('', '<details><summary>Thumbnails</summary>', '');
  for (const r of results.filter((x) => x.thumb)) lines.push(`[<img src="${raw(r.thumb)}" width="320" alt="${r.script}">](${blob(r.video)})`);
  lines.push('', '</details>');
}
lines.push('', '<sub>Recorded with the `manual-qa` skill: headless Chromium; command-line steps are shown in an in-browser terminal, the caption shows the case and its verdict.</sub>');

const report = join(OUT, '..', 'report.md');
writeFileSync(report, lines.join('\n') + '\n');
console.log('report:', report);
if (!args['dry-run']) {
  console.log(run('gh', ['pr', 'comment', args.pr, '--body-file', report]));
}
console.log(`verdict: ${verdict}`);
