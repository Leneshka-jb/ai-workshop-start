---
name: demo
description: Record a short video of the web view showing the organization scan (issue #5) and the skill filter (issue #2), saved to docs/demo/ as YYYY-MM-DD-hh:mm:ss-demo.webm. Use when asked for a demo, a screencast or a video of these features.
---

# Record the demo video

The script [record.mjs](record.mjs) starts `./skill-atlas serve` on a free port, drives it in headless
Chromium with Playwright and records the page:

1. **Organization scan** (#5): types `https://github.com/Leneshka-jb`, *Scan* → `Leneshka-jb · N repositories`, each with its skill count.
2. Clicks *Scan* on `Leneshka-jb/ai-workshop-start` → `… · 6 skills`.
3. **Filter** (#2, #11): types `review` in the filter under the header; it applies as you type → `… · 2 of 6 skills`.
4. Filter `no-such-skill` → `… · No matching skills`.

The video (~25 s, 1280×800, WebM) is written to `docs/demo/<YYYY-MM-DD-hh:mm:ss>-demo.webm`, local time
at the start of the recording.

## Steps

Run from the repository root.

1. Dependencies (Playwright is not a project dependency; `--no-save` keeps `package.json` unchanged):
   ```bash
   npm ci
   npm i --no-save playwright
   npx playwright install --with-deps chromium
   ```
2. A GitHub token is needed: the organization scan reads every repository and exceeds the anonymous
   rate limit of 60 requests per hour.
   ```bash
   export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"
   ```
3. Record. Optional arguments: an organization URL (default `https://github.com/Leneshka-jb`; it must own an
   `ai-workshop-start` repository) and a filter text (default `review`).
   ```bash
   node .agents/skills/demo/record.mjs
   rmdir docs/demo/.recording 2>/dev/null
   ```
   It prints each status line and the path of the video.
4. Check the video: the printed statuses must be the ones above, not an error. To look at it, extract
   a few frames: `ffmpeg -ss 6 -i <video> -frames:v 1 /tmp/frame.png`, then view the image.
5. Report the video path. Commit it only if asked.
