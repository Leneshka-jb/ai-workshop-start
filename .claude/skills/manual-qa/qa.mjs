#!/usr/bin/env node
// Records a manual-QA session in a browser, driven one step at a time from the shell.
// One session = one QA script = one video. CLI steps run in bash and are shown in an in-browser
// terminal; web steps drive a real page. A caption names the current case and, once given, its result.
//
//   node qa.mjs start <name> [script.md]     start recording (a background daemon); the script it follows
//   node qa.mjs case <id> <title…>           begin a case; the previous one must have a result
//   node qa.mjs term <command>               run in bash (cwd: QA_ROOT) and show it; prints stdout, stderr, exit code
//   node qa.mjs bg <command>                 start a long-running command (a server); prints its first output
//   node qa.mjs open <url>                   load a page
//   node qa.mjs type <selector> <text>       clear a field and type into it
//   node qa.mjs click <selector>             click; Playwright selectors: css, text=…, role=button[name="…"]
//   node qa.mjs press <selector> <key>       e.g. press '#q' Enter
//   node qa.mjs wait <selector> [text]       wait until visible (and containing the text); prints its text
//   node qa.mjs text <selector>              print the text of every match, one per line
//   node qa.mjs eval <js>                    evaluate an expression in the page, print the JSON result
//   node qa.mjs tab <n>                      switch to tab n (0 = the first); click reports new tabs
//   node qa.mjs shot                         screenshot; prints the PNG path, to look at
//   node qa.mjs note <text>                  a note in the video, e.g. how a step was done instead
//   node qa.mjs result <pass|fail|skip> <why…>   the verdict of the current case and what was seen
//   node qa.mjs stop                         stop background commands; write <out>/<name>.mp4 and <name>.json
//
// Environment: QA_ROOT (where commands run, default cwd), QA_OUT (default /tmp/manual-qa/out),
// QA_TIMEOUT (seconds per term command, default 600), QA_WAIT (seconds for wait, default 120).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const OUT = resolve(process.env.QA_OUT ?? '/tmp/manual-qa/out');
const STATE = join(OUT, '..', 'daemon.json');
const [command, ...rest] = process.argv.slice(2);

if (command === '__daemon') await daemon(...rest);
else if (command === 'start') await start(...rest);
else if (command) await client(command, rest);
else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 25).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));

function fail(message) { console.error(message); process.exit(1); }

async function start(name, source = '') {
  if (!name) fail('usage: qa.mjs start <name> [script.md]');
  if (existsSync(STATE)) fail(`a session is running (${STATE}); run "qa.mjs stop" first`);
  mkdirSync(OUT, { recursive: true });
  const log = join(OUT, '..', `${name}.daemon.log`);
  const { openSync } = await import('node:fs');
  const fd = openSync(log, 'w');
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '__daemon', name, source], {
    detached: true, stdio: ['ignore', fd, fd],
  });
  child.unref();
  for (let i = 0; i < 150 && !existsSync(STATE); i++) await new Promise((r) => setTimeout(r, 200));
  if (!existsSync(STATE)) fail(`the recorder did not start; see ${log}`);
  console.log(`recording ${name}`);
}

async function client(cmd, argv) {
  if (!existsSync(STATE)) fail('no session; run "qa.mjs start <name>" first');
  const { port } = JSON.parse(readFileSync(STATE, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: JSON.stringify({ cmd, argv }) })
    .catch(() => fail(`the recorder is not running (crashed?); see ${join(OUT, '..')}/*.daemon.log, then delete ${STATE}`));
  const { ok, output } = await response.json();
  if (output) process.stdout.write(output.endsWith('\n') ? output : output + '\n');
  process.exitCode = ok ? 0 : 1;
}

// ---------------------------------------------------------------- the recorder

async function daemon(name, source) {
  const { chromium } = await import('playwright');
  const ROOT = resolve(process.env.QA_ROOT ?? process.cwd());
  const SIZE = { width: 1280, height: 800 };
  const MAX_LINES = 30; // output lines shown per command in the video; the caller gets all of it
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const TERMINAL = `<!doctype html><meta charset="utf-8"><title>Terminal</title><style>
    body { margin: 0; background: #1e1e1e; color: #ddd; font: 15px/1.4 ui-monospace, Menlo, Consolas, monospace; }
    #log { padding: 70px 18px 18px; white-space: pre-wrap; word-break: break-all; }
    .cmd { color: #8fd; } .cmd::before { content: '$ '; color: #7a7; } .err { color: #f88; }
    .code { color: #999; margin-bottom: .8em; } .code.bad { color: #fa6; } .note { color: #999; font-style: italic; }
  </style><div id="log" data-qa-terminal></div>`;

  const tmp = join(OUT, `.recording-${name}`);
  rmSync(tmp, { recursive: true, force: true });
  const browser = await chromium.launch();
  // One context, one page in view: the video follows the tab in front (see `tab`).
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
  context.setDefaultTimeout(15_000); // a missing element fails fast; `wait` has its own, longer timeout
  let page = await context.newPage();
  const first = page;
  const started = Date.now();
  const cases = [];
  const background = [];
  let current = null;
  let history = [];

  async function caption(p = page) {
    if (!current) return;
    const color = { pass: '#6d6', fail: '#f66', skip: '#fc6' }[current.result] ?? '#fff';
    const html = `<b>${esc(name)} · ${esc(current.id)} ${esc(current.title)}</b>`
      + (current.result ? `<div style="color:${color}">${current.result.toUpperCase()}: ${esc(current.note)}</div>` : '');
    await p.evaluate((html) => {
      let box = document.getElementById('__qa_caption');
      if (!box) {
        box = document.createElement('div');
        box.id = '__qa_caption';
        box.style.cssText = 'position:fixed;top:0;right:0;max-width:55%;z-index:2147483647;background:#000c;color:#fff;'
          + 'font:13px/1.35 system-ui,sans-serif;padding:8px 12px;border-bottom-left-radius:8px;pointer-events:none';
        document.documentElement.append(box);
      }
      box.innerHTML = html;
    }, html).catch(() => {});
  }
  const watch = (p) => p.on('load', () => caption(p));
  watch(page);
  context.on('page', watch);

  const onTerminal = () => page.$('#log[data-qa-terminal]').catch(() => null);
  async function terminal(...entries) {
    history.push(...entries);
    if (page !== first) { page = first; await page.bringToFront(); }
    if (!(await onTerminal())) await page.setContent(TERMINAL);
    await page.evaluate((html) => { document.getElementById('log').innerHTML = html; window.scrollTo(0, document.body.scrollHeight); }, history.join(''));
    await caption();
  }
  const shown = (text, cls) => {
    if (!text) return '';
    const all = text.replace(/\n$/, '').split('\n');
    const lines = all.length > MAX_LINES ? [`… ${all.length - MAX_LINES} more lines`, ...all.slice(-MAX_LINES)] : all;
    return `<div class="${cls}">${esc(lines.join('\n'))}</div>`;
  };
  const pause = (ms) => page.waitForTimeout(ms);
  const needCase = () => { if (!current) throw new Error('start a case first: qa.mjs case <id> <title>'); };
  const locator = (selector) => page.locator(selector).first();

  async function stop() {
    if (current && !current.result) Object.assign(current, { result: 'fail', note: 'no result: the session stopped first' });
    if (current) cases.push(current);
    current = null;
    for (const child of background) try { process.kill(-child.pid); } catch {}
    await pause(800);
    const video = first.video();
    await context.close();
    await browser.close();
    const webm = await video.path();
    // H.264 MP4 plays everywhere; the pages are mostly static, so it stays small.
    let file = join(OUT, `${name}.mp4`);
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart', file]);
    if (ff.status !== 0) { file = join(OUT, `${name}.webm`); renameSync(webm, file); }
    rmSync(tmp, { recursive: true, force: true });
    const seconds = Math.round((Date.now() - started) / 1000);
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ script: name, source, video: file, seconds, cases }, null, 2));
    const n = (r) => cases.filter((c) => c.result === r).length;
    return `${name}: ${n('pass')} pass, ${n('fail')} fail, ${n('skip')} skip → ${file}`;
  }

  const commands = {
    async case(id, ...title) {
      if (!id) throw new Error('usage: case <id> <title>');
      if (current && !current.result) throw new Error(`case ${current.id} has no result yet: result <pass|fail|skip> <why>`);
      if (current) cases.push(current);
      current = { id, title: title.join(' '), result: null, note: '', at: Math.round((Date.now() - started) / 100) / 10 };
      history = [];
      if (await onTerminal()) await terminal(); // a new case starts with an empty terminal
      else if (page.url() === 'about:blank') await page.setContent(TERMINAL);
      await caption();
      await pause(600);
      return `${name} · ${id} ${current.title}`;
    },
    async term(...words) {
      needCase();
      const cmd = words.join(' ');
      await terminal(`<div class="cmd">${esc(cmd)}</div>`);
      await pause(400);
      const r = await new Promise((done) => {
        const child = spawn('bash', ['-c', cmd], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.stderr.on('data', (c) => { stderr += c; });
        const timer = setTimeout(() => child.kill('SIGKILL'), Number(process.env.QA_TIMEOUT ?? 600) * 1000);
        child.on('close', (code, signal) => { clearTimeout(timer); done({ stdout, stderr, code: code ?? signal }); });
      });
      await terminal(shown(r.stdout, 'out'), shown(r.stderr, 'err'), `<div class="code ${r.code === 0 ? '' : 'bad'}">[exit ${r.code}]</div>`);
      await pause(1200);
      return `--- stdout\n${r.stdout}--- stderr\n${r.stderr}--- exit ${r.code}`;
    },
    async bg(...words) {
      needCase();
      const cmd = words.join(' ');
      await terminal(`<div class="cmd">${esc(cmd)} &amp;</div>`);
      const child = spawn('bash', ['-c', cmd], { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      background.push(child);
      let out = '';
      child.stdout.on('data', (c) => { out += c; });
      child.stderr.on('data', (c) => { out += c; });
      const exited = new Promise((r) => child.on('exit', r));
      const spoke = new Promise((r) => { const t = setInterval(() => { if (out) { clearInterval(t); r(); } }, 100); });
      await Promise.race([exited, spoke, pause(5000)]);
      await pause(300);
      await terminal(shown(out, 'out'));
      await pause(800);
      return `pid ${child.pid} ${child.exitCode === null ? 'running' : `exited ${child.exitCode}`}\n${out}`;
    },
    async open(url) {
      needCase();
      await page.goto(url);
      await caption();
      await pause(1000);
      return `${page.url()} — ${await page.title()}`;
    },
    async type(selector, ...text) {
      needCase();
      await locator(selector).fill('');
      await locator(selector).pressSequentially(text.join(' '), { delay: 25 });
      await pause(300);
      return 'ok';
    },
    async click(selector) {
      needCase();
      const before = context.pages().length;
      await locator(selector).click();
      await pause(1000);
      const pages = context.pages();
      if (pages.length === before) return 'ok';
      const tab = pages.at(-1);
      await tab.waitForLoadState().catch(() => {});
      return `opened tab ${pages.length - 1}: ${tab.url()} (still on tab ${pages.indexOf(page)}; "tab ${pages.length - 1}" to look at it)`;
    },
    async tab(n) {
      const pages = context.pages();
      if (!pages[n]) throw new Error(`no tab ${n}; there are ${pages.length}`);
      page = pages[n];
      await page.bringToFront();
      await caption();
      await pause(1500);
      return `${page.url()} — ${await page.title()}`;
    },
    async press(selector, key) { needCase(); await locator(selector).press(key); await pause(500); return 'ok'; },
    async wait(selector, ...text) {
      needCase();
      const want = text.join(' ');
      const target = want ? page.locator(selector).filter({ hasText: want }).first() : locator(selector);
      await target.waitFor({ state: 'visible', timeout: Number(process.env.QA_WAIT ?? 120) * 1000 });
      await pause(500);
      return (await target.textContent()) ?? '';
    },
    async text(selector) { return (await page.locator(selector).allTextContents()).join('\n'); },
    async eval(...js) { return JSON.stringify(await page.evaluate(js.join(' ')), null, 1) ?? 'undefined'; },
    async shot() {
      const file = join(OUT, '..', `shot-${Date.now()}.png`);
      await page.screenshot({ path: file });
      return file;
    },
    async note(...text) {
      needCase();
      const t = text.join(' ');
      if (await onTerminal()) await terminal(`<div class="note"># ${esc(t)}</div>`);
      current.notes = [...(current.notes ?? []), t];
      await pause(800);
      return 'ok';
    },
    async result(verdict, ...why) {
      needCase();
      if (!['pass', 'fail', 'skip'].includes(verdict)) throw new Error('result is pass, fail or skip');
      if (!why.length) throw new Error('say why: what was seen, or why it was not run');
      current.result = verdict;
      current.note = why.join(' ');
      await caption();
      await pause(verdict === 'pass' ? 1200 : 2500);
      return `${current.id}: ${verdict}`;
    },
  };

  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { cmd, argv } = JSON.parse(body);
    let ok = true, output;
    try {
      if (cmd === 'stop') output = await stop();
      else if (Object.hasOwn(commands, cmd)) output = await commands[cmd](...argv);
      else throw new Error(`unknown command: ${cmd}`);
    } catch (error) {
      ok = false;
      output = `error: ${error.message.split('\n')[0]}`;
    }
    res.end(JSON.stringify({ ok, output }));
    if (cmd === 'stop' && ok) { rmSync(STATE, { force: true }); server.close(); process.exit(0); }
  });
  server.listen(0, '127.0.0.1', () => writeFileSync(STATE, JSON.stringify({ port: server.address().port, pid: process.pid, name })));
}
