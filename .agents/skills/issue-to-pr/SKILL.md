---
name: issue-to-pr
description: Implement a GitHub issue end to end — spec, code and integration tests — and open a pull request for it. Always posts the result as a comment on the issue. Use when asked to fix, implement or "do" an issue by number or URL.
---

# Issue → pull request

The input is an issue number or URL. Ask for it if none is given.

## 1. Read the issue

```bash
gh issue view <n> --json number,title,body,labels,comments,url
```

- Restate the requested behaviour in one or two sentences, including the comments: later comments
  often narrow or change the request.
- If the issue is ambiguous or contradicts the spec, stop and ask before writing code. Do not guess
  a behaviour the spec does not already imply. Post the questions on the issue (step 7) too.

## 2. Branch

Start from an up-to-date `main` with a clean working tree:

```bash
git switch main && git pull --ff-only
git switch -c issue-<n>-<short-slug>
npm ci
```

## 3. Spec first

Read [spec/](../../../spec/) — it is the source of truth.

- Find where the new behaviour belongs (`spec/analysis.md` for scanning, grouping and parsing;
  `spec/cli.md` for commands, output and exit codes) and write the new or changed case there
  before touching code.
- Keep existing decisions intact: byte-for-byte grouping, search scope (skip `.git` and
  `node_modules` at every depth, regular `SKILL.md` files only, no symlinks), GitHub via the API
  only with pinned links, locale-independent sorting (no `localeCompare`), warnings to stderr,
  exit code 1 for an unreachable repository.

## 4. Test, then implement

- Add an integration test in `tests/` for every spec case you added or changed. Run the command the
  way the CLI does with `atlas([...])` from `tests/helpers.ts` and assert the exact `stdout`,
  `stderr` and `code`.
- GitHub answers come from a `replay` recording — never the network.
- New local cases go in `fixture/` and get a line in `fixture/README.md`.
- Run `npm test` and see the new test fail for the right reason.
- Implement in the core (fetch → find → group → parse under `src/core/`); keep `src/cli.ts` and
  `src/commands.ts` a thin client. Make the smallest change that satisfies the spec.

## 5. Verify, as CI does

```bash
npm run typecheck
npm test
./skill-atlas help && ./skill-atlas scan ./fixture
```

All must pass. Fix and rerun until they do; never weaken or delete an existing test to get green.
Then review your own diff (`git diff main`) with the `review-pr` checklist and fix what it finds.

## 6. Commit and open the PR

```bash
git add -A
git commit -m "<imperative summary> (#<n>)"
git push -u origin HEAD
gh pr create --base main --title "<imperative summary>" --body-file <file>
```

The PR body:

```markdown
Closes #<n>

## What
<the behaviour change, in user terms>

## Spec
<which section of spec/ changed and how>

## Tests
<the new tests and what each checks>

## Checks
- [x] npm run typecheck
- [x] npm test
- [x] ./skill-atlas scan ./fixture
```

Report the PR URL. Do not merge it.

## 7. Comment on the issue — always

Every run ends with one comment on the issue, whatever the outcome: PR opened, stopped with
questions, or failed. Write it to a file outside the repository (e.g. under `/tmp`) and post it:

```bash
gh issue comment <n> --body-file /tmp/issue-<n>-result.md
```

Keep it short:

```markdown
**Result:** PR opened: <PR URL> | Need input | Failed at <step>

<one or two sentences: what was done, or what blocked it>

- Spec: <section changed, or "none">
- Tests: <new tests, or "none">
- Checks: typecheck <pass/fail>, tests <pass/fail>, smoke <pass/fail>

<for Need input: the numbered questions; for Failed: the failing command and the key lines of its output>
```

Show the same text in the chat with the comment link `gh` prints. If posting fails, say so;
the run is not done until the comment is on the issue.
