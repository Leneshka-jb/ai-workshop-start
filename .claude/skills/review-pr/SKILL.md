---
name: review-pr
description: Review a pull request against this repository's spec, tests and definition of done. Use when asked to review a PR, a branch or the current diff.
---

# Review a pull request

The target is a PR number or URL, a branch, or the current working-tree diff when nothing is given.

## 1. Get the change

- PR: `gh pr view <n> --json title,body,baseRefName,headRefName,files` and `gh pr diff <n>`.
- Branch: `git diff main...<branch>`; current changes: `git diff main` plus untracked files.
- Read the PR description: what behaviour does it claim to change?

## 1a. Recheck previous reviews

For a PR, collect earlier findings: `gh pr view <n> --json reviews,comments` and
`gh api repos/{owner}/{repo}/pulls/<n>/comments` (inline comments, with `path` and `line`).
Recheck each against the current head. Fold every issue that still holds into this review as a
normal finding, tagged `(prev)`. Drop those that are fixed or outdated; do not list them.

## 2. Check it against the spec

Read [spec/](../../../spec/) first. The spec is the source of truth.

- A behaviour change without a matching edit to `spec/analysis.md` or `spec/cli.md` is a finding.
- A spec edit without a matching code change (or vice versa) is a finding.
- Flag code that contradicts a spec decision, in particular:
  - grouping by byte-for-byte identical contents, no normalization;
  - search scope: whole tree, hidden dirs included, skip `.git` and `node_modules` at every depth,
    regular files named exactly `SKILL.md`, no symlinks;
  - GitHub via the API only (no clone), links pinned to the scanned commit, no partial scans on
    truncated trees;
  - name/ID/sort rules: case-sensitive, locale-independent order (no `localeCompare`);
  - warnings to stderr, the scan goes on; unreachable repository → clear message, exit code 1;
  - core is fetch → find → group → parse; `src/cli.ts` / `src/commands.ts` stay a thin client.

## 3. Check the tests

- Every new or changed spec case has an integration test in `tests/` that runs the command the
  way the CLI does (`atlas([...])` from `tests/helpers.ts`), not only a unit call.
- GitHub responses come from a `replay` recording; tests must not hit the network.
- New fixture cases go in `fixture/` and are described in `fixture/README.md`.
- Assertions check exact output, not just "contains".

## 4. Run it

On the PR's code (`gh pr checkout <n>` or the branch), as CI does:

```bash
npm ci
npm run typecheck
npm test
./skill-atlas help && ./skill-atlas scan ./fixture
```

Report failures with their output. Not done unless all of these pass.

## 5. Read the code for bugs

Look for: unhandled promise rejections, errors that crash instead of warning, wrong exit codes,
path handling that differs between local and GitHub sources, ordering that depends on the
filesystem or API order, decoding that is not UTF-8, and leftover debug output on stdout.

## 6. Report

Keep it short: no summary of the PR, no praise, no list of what was checked. Only findings,
grouped by severity — **blocking** (spec violation, failing check, bug), **should fix** (missing
test, spec drift), **nit**. Each finding is at most a few lines:

```
- `src/core/scan.ts:42` (prev) — symlinked dirs are followed, spec says not to.
  Repro: `ln -s .. fixture/loop && ./skill-atlas scan ./fixture` → hangs / duplicate links.
  Fix: skip entries where `lstat().isSymbolicLink()`.
```

- **Where:** `file:line` in the PR's code.
- **Repro:** an exact command, test or input and what it gives versus what the spec expects.
  Do not report a finding without one.
- **Fix:** one line.

End with one line: `Verdict: approve` or `Verdict: request changes`. No findings → just the verdict.

Post comments to GitHub only when the user asks (`gh pr review <n> --comment|--request-changes|--approve -b ...`).
