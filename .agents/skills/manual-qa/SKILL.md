---
name: manual-qa
description: Run the manual QA scripts in qa/ on a pull request. It follows each script step by step in a recorded browser, judges every case Pass, Fail or Skip, and posts the result with the videos as a comment on the PR. Use when asked for manual QA, to run the QA scripts, or to test a PR by hand.
---

# Manual QA of a pull request

The target is a PR number or URL. With none given, use the PR of the current branch
(`gh pr view --json number -q .number`). The QA scripts are whatever `*.md` files the PR has in
`qa/`. Read them fresh every run: nothing here depends on what they contain.

Tools in this directory:
- [qa.mjs](qa.mjs) records one browser session per QA script. You drive it one command at a time and
  read its output. Run it with no arguments for the command list.
- [report.mjs](report.mjs) builds the report from the sessions, publishes the videos and comments on the PR.

Below, `QA` stands for `node <repo>/.agents/skills/manual-qa/qa.mjs`, written out in full in each call.

## 1. Set up

From the repository root (this checkout supplies the skill and Playwright):

```bash
npm i --no-save playwright && npx playwright install --with-deps chromium
which ffmpeg || sudo apt-get install -y ffmpeg
gh pr view <n> --json number,title,headRefOid,url
git fetch origin pull/<n>/head
rm -rf /tmp/manual-qa && git worktree add --detach /tmp/manual-qa/src FETCH_HEAD
export QA_ROOT=/tmp/manual-qa/src            # every `term`/`bg` command runs here
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"
```

Then prepare `QA_ROOT` the way `qa/README.md` ("Before you start") and `AGENTS.md` say, for example
`npm ci`. Exported variables reach the recorder only if they are set before `QA start`.

## 2. Follow each script

Read `qa/README.md`, then take the scripts in file order. For each one:

```bash
QA start 05-web-filter qa/05-web-filter.md   # name = file name without .md; path relative to the repo
QA case 5.1 Empty filter                     # the case's number and title, as in the script
QA bg './skill-atlas serve 3123'             # a server or other long-running step
QA open http://localhost:3123/
QA type '#repo' https://github.com/JetBrains/kotlin
QA click 'role=button[name="Scan"]'
QA wait '#status' 'skills'                   # prints the text it waited for
QA text '.skill h2'
QA result pass 'header "JetBrains/kotlin · 7 skills", 7 cards'
QA case 5.2 Match by name
…
QA stop                                      # writes /tmp/manual-qa/out/<name>.mp4 and .json
```

- **Do the steps as written**, in order, the way a tester would. Command-line steps go through
  `QA term '<command>'`: pass the whole command as one quoted argument and use `"$(cat <<'EOF' … EOF)"`
  for several lines. Its output is shown in the video and printed back to you in full. Browser steps go
  through `open`, `type`, `click`, `press`. Prefer the visible action over `eval`: the video is the
  evidence.
- **Check every Expected item** against what you actually got: exact text where the script gives
  exact text, exit codes, order, counts, what must *not* appear. Use `text`, `eval` and `shot` (then view
  the PNG) for the page. Never decide from memory or from what the code should do.
- **Look before you judge**: read the output of the last check before `QA result`. A verdict cannot
  be changed once the next case starts. If one was wrong, stop and record that script again.
- **One verdict per case**, with `QA result`:
  - `pass <what was seen>`: every expected item was observed.
  - `fail <expected X, got Y>`: anything differs. Quote the actual output. If the script itself looks
    out of date (the product is right and the wording is wrong), still give `fail` and start the reason
    with `script out of date:`.
  - `skip <why>`: only when a step cannot be done here. Examples: it needs another machine, hardware,
    or an account or setup that is missing, or it would change something outside this run (repository
    secrets or settings, new repositories, comments, issues, anything that triggers automations).
    Never skip a case because it is slow or tedious.
  - A case that is partly doable: do that part, then fail on what you saw or skip with the reason, and
    list what was and was not checked.
- An equivalent that keeps the intent is fine. Say so with `QA note` before you use it. For example:
  "Wi-Fi off" becomes `sudo unshare -n -- sudo -u "$(id -un)" env PATH="$PATH" <command>`, and "from
  another machine" becomes this machine's non-loopback address. Note it in the verdict as well.
- Only the first tab is in the video. When `click` opens a new tab, `QA tab 1` lets you inspect it;
  then go back with `QA tab 0`, or `open` the URL in the first tab so that it is recorded.
- github.com sometimes shows headless Chromium its "Unicorn!" error page. Check the page title. Retry,
  or use the `…/raw/<commit>/<path>` URL and say so in a note.
- A step whose page already shows the expected text proves nothing: `open` the page fresh first.
- Scratch files go in `mktemp -d` directories, never in `QA_ROOT`. Do not edit the code under test or
  the scripts.
- If a command errors (`error: …`), fix the call and go on. If the recorder dies, read
  `/tmp/manual-qa/<name>.daemon.log`, delete `/tmp/manual-qa/daemon.json` and start the script again.
- After `QA stop`, extract a frame or two to check that the video shows the steps:
  `ffmpeg -ss 10 -i /tmp/manual-qa/out/<name>.mp4 -frames:v 1 /tmp/manual-qa/frame.png`, then view it.

## 3. Report on the PR

```bash
node .agents/skills/manual-qa/report.mjs --pr <n> --sha <headRefOid>
```

What it does:
- Commits each video (MP4) and an animated GIF of it (2 fps) to the `qa-recordings` branch, under
  `pr-<n>/<timestamp>/`. The branch is orphan and holds only recordings; it is created on first use.
  The links in the comment are pinned to that commit. GitHub plays no committed video inline, so the
  comment embeds the GIFs and links the MP4 for download.
- Writes `/tmp/manual-qa/report.md`: an overall verdict (Fail if any case fails), a table per script
  with a video link, the failures with the time in the video, the skipped cases with their reasons, and
  every case.
- Posts it with `gh pr comment` and prints the comment URL. With `--edit-last` it replaces your last
  comment instead, e.g. after re-recording.

Use `--dry-run` to write the report without pushing or posting. In Air, the videos are also copied
to `$AIR_ARTIFACTS_DIR/manual-qa/`.

Show the user the verdict, the failures and the comment link. Then clean up:
`git worktree remove --force /tmp/manual-qa/src`.
