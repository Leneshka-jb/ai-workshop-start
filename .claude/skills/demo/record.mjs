// Records a short video of the web view: an organization scan (issue #5), then the skill filter (issue #2).
// Usage: node .claude/skills/demo/record.mjs [org URL] [filter]   (run from the repository root)
import { spawn } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ORG = process.argv[2] ?? 'https://github.com/Leneshka-jb';
const REPO = ORG.replace(/\/$/, '') + '/ai-workshop-start';
const FILTER = process.argv[3] ?? 'review';
const PORT = 3100 + Math.floor(Math.random() * 800);
const OUT = 'docs/demo';
const SIZE = { width: 1280, height: 800 };

const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const server = spawn(process.execPath, ['src/cli.ts', 'serve', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (chunk) => String(chunk).includes(String(PORT)) && resolve());
  server.on('exit', (code) => reject(new Error('server exited with ' + code)));
});

const browser = await chromium.launch();
const tmp = join(OUT, '.recording');
mkdirSync(tmp, { recursive: true });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const status = page.locator('#status');
const scanned = () => page.waitForFunction(() => {
  const s = document.getElementById('status').textContent;
  return s && s !== 'Scanning…';
}, null, { timeout: 120_000 });

try {
  await page.goto(`http://localhost:${PORT}/`);
  await pause(1000);

  // 1. Organization scan: an owner link lists its repositories with their skill counts.
  await page.locator('#repo').pressSequentially(ORG, { delay: 60 });
  await pause(400);
  await page.getByRole('button', { name: 'Scan', exact: true }).first().click();
  await scanned();
  console.log('organization:', await status.textContent());
  await pause(3000);

  // 2. Scan one repository from the list.
  const row = page.locator('.repo', { hasText: REPO.split('/').slice(-2).join('/') });
  await row.scrollIntoViewIfNeeded();
  await row.getByRole('button', { name: 'Scan' }).click();
  await scanned();
  console.log('repository:', await status.textContent());
  await pause(2500);

  // 3. Filter by text: "M of N skills".
  await page.locator('#filter').pressSequentially(FILTER, { delay: 120 });
  await pause(400);
  await page.locator('#filter').press('Enter');
  await scanned();
  console.log('filter:', await status.textContent());
  await pause(3000);

  // 4. A filter that matches nothing.
  await page.locator('#filter').fill('');
  await page.locator('#filter').pressSequentially('no-such-skill', { delay: 80 });
  await page.locator('#filter').press('Enter');
  await scanned();
  console.log('no match:', await status.textContent());
  await pause(2000);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  server.kill();
  if (video) {
    const file = join(OUT, `${stamp}-demo.webm`);
    renameSync(await video.path(), file);
    console.log('video:', file);
  }
}
