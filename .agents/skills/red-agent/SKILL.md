---
name: red-agent
description: Explore the web view for bugs and file one GitHub issue per confirmed bug, with reproduction steps, a video, and the label "Delegated to AI". Use when asked to run red-agent or hunt for and report web-view bugs.
---

# Find and report web-view bugs

Test the running web view as a user would, including edge cases and transitions between states.
File one actionable GitHub issue per distinct confirmed bug. Every new issue must include numbered
reproduction steps, expected and actual results, a reproduction video, and `Delegated to AI`.
Invoking this workflow authorizes publishing its evidence and filing those issues. Do not fix the
application or post Slack messages as part of this skill.

## Establish the target

- Use the user's URL, branch or PR when supplied; otherwise test the current checkout. Identify
  the GitHub repository with `gh repo view --json nameWithOwner,url` and record the tested commit
  with `git rev-parse HEAD`, plus any local modifications that affect the result. Do not discard them.
- Read `spec/`, especially `spec/web.md` and `spec/analysis.md`, and the relevant scripts in `qa/`.
  Use them for expected behavior and coverage, then explore beyond their scripted examples.
- Follow `AGENTS.md` for setup (`npm ci` in a fresh checkout). Start `./skill-atlas serve <free-port>`
  if a server is needed. Use existing credentials without displaying or recording them.
- Keep a run directory outside the source tree, with notes, issue drafts and recordings. Track
  each scenario as checked, failed or blocked, with observed evidence. Record browser and viewport.

## Explore and confirm

Use the available browser skill and inspect actual rendered results after each meaningful action.
Cover repository and organization scans, scanning a repository from organization results, filtering,
empty results, warnings, invalid input, errors and recovery. Exercise keyboard interaction, narrow
viewports, long text, repeated submissions, and switching inputs while a scan is in progress where
the available browser supports them. Check for stale results, misleading counts, hidden controls,
broken links and unsafe rendering. Derive exact assertions from the current spec, not fixed counts
in a live GitHub repository.

- Compare visible behavior with the spec or a concrete usability failure. A source-code suspicion
  alone is not a confirmed bug. Note ambiguous product expectations separately.
- Distinguish application failures from missing credentials, GitHub rate limits, unavailable
  services and recorder failures. Test how the app handles those conditions when possible.
- Reduce each failure to a short reproduction from a known initial state and repeat it. For
  intermittent failures, record observed frequency and triggering conditions without claiming
  determinism. Group manifestations of the same bug; keep independently reproducible bugs separate.
- Use controlled fixtures when needed for stable data or delays, and disclose that setup in the
  steps. Do not alter the application to make it fail or present simulated output as observed behavior.

## Record each bug

Capture a short video showing the initial state, all reproduction actions and the visible failure.
Prefer the browser's recording facility when available. If it cannot record, the existing
[manual-QA recorder](../manual-qa/qa.mjs) provides a recorded browser; read its command help first.
Use the recorder directly, without invoking the manual-QA PR-reporting workflow.

For that recorder, install Playwright and its Chromium browser if missing, following the setup in
[manual-qa](../manual-qa/SKILL.md). Set `QA_ROOT` to the tested checkout and `QA_OUT` to
`<unique-run-directory>/out`, with the same values on every recorder command. This isolates both
the output and `daemon.json` from other runs. Run `node .agents/skills/manual-qa/qa.mjs` with:

1. `start <unique-bug-name>` and `case <id> <short-title>`.
2. `open`, `type`, `click` and `press` to reproduce; `text` and `shot` to inspect the outcome.
3. `result fail <expected-versus-observed>` only after inspecting the evidence, then `stop` to
   finalize the video and JSON. Keep reproduction in the first tab, which is the recorded tab.

Check the finished video: inspect frames around the actions and failure, confirm readability and
that it contains no credentials or private data. Re-record if it does not demonstrate the bug.
Keep one clip per bug, or give exact timestamps if a shared recording clearly covers several.

## Publish evidence and file issues

Search existing open and closed issues in the target repository for each symptom before filing.
Read likely matches: reuse an open issue for the same bug, adding missing steps and video evidence
and ensuring it has `Delegated to AI`. For a recurrence of a closed bug, file a new issue and link
the previous one with the tested version. Do not file duplicates for repeated sightings in this run.

Publish verified videos using an available attachment facility, or the repository's existing
`qa-recordings` branch convention: add only this run's clips under `red-agent/<run-id>/` and link to
the resulting commit. Preserve existing recordings, use a fast-forward update, and never force-push.
Use GitHub's API or an isolated publishing checkout; do not switch the tested checkout to that branch.
An optional GIF preview may accompany the video but does not replace it. Do not run
`manual-qa/report.mjs`: it posts a PR report. Check that the published video URLs are accessible to
the issue's readers; a local path or a temporary session artifact alone is insufficient.

Ensure the label exists with its exact spelling. If absent, create it:

```bash
gh label create 'Delegated to AI' --repo <owner/repo> --color 7057ff --description 'Delegated to AI for implementation'
```

Write each issue body to a file using this structure, filling it with observed evidence:

```markdown
## Problem
<User-visible failure and impact>

## Environment and prerequisites
<Tested commit/PR, relevant local changes, browser, viewport, input URLs or fixture setup>

## Steps to reproduce
1. <Start from a known state>
2. <Exact inputs and actions>

## Expected result
<Expected behavior, with a spec reference when applicable>

## Actual result
<Observed behavior; include frequency for intermittent failures>

## Video
[Watch reproduction](<published-video-url>) — <relevant timestamp if needed>
```

Create the issue with a concise title describing the failure:

```bash
gh issue create --repo <owner/repo> --title '<failure>' --body-file <draft-file> --label 'Delegated to AI'
```

Verify the returned issue's body, video link and label. If creation times out or returns an ambiguous
error, search for the issue before retrying. If evidence publication or issue permissions are blocked,
retain the video and complete draft, report the blocker, and do not claim the issue was filed.

Finish with issue links, a brief coverage summary and any blocked scenarios or unfiled findings.
If no bugs were confirmed, say so without claiming exhaustive coverage. Stop only the servers and
recorders started for this run; preserve the evidence and drafts.
