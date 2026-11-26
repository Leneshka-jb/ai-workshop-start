# 09 · Issue-comment workflow

Spec: [action.md](../spec/action.md). Needs a GitHub repository with this workflow on its default branch,
and write access to its **Settings → Secrets** and **Actions**.

## 9.1 Comment created, edited, deleted
**Steps**
1. Make sure the `AIR_AUTOMATION_API_KEY` secret is set.
2. On an issue, add a comment; edit it; delete it. Repeat on a pull request.

**Expected**
- **Actions** shows one *Issue comment* run per event (6 runs), each green.
- The *Send the event to the Air automation* step POSTs to the Air gateway; the automation receives the
  event payload unchanged (check on the Air side: `action` is `created` / `edited` / `deleted`).

## 9.2 Missing secret
**Steps**: delete the `AIR_AUTOMATION_API_KEY` secret, add a comment.

**Expected**: the run fails with the annotation `Set the AIR_AUTOMATION_API_KEY repository secret`; nothing is sent.

## 9.3 Wrong key
**Steps**: set the secret to `wrong`, add a comment.

**Expected**: the run fails (the gateway answers an error); the log shows the error body, not the key (masked as `***`).

## 9.4 Bot comments are skipped
**Steps**: let a bot comment (e.g. a GitHub App or Dependabot, or an automation that comments back).

**Expected**: the run is shown as **skipped**; nothing is sent, so the automation cannot trigger itself.

## 9.5 Comment text cannot inject commands
**Steps**: comment ``$(echo pwned) `id` "; exit 1; echo "``.

**Expected**: the run is green; the log never shows `pwned` or the output of `id`. The text only appears inside the sent JSON.

## 9.6 Token has no permissions
**Steps**: open a run, expand *Set up job* → *GITHUB_TOKEN Permissions*.

**Expected**: no permissions listed (the workflow declares `permissions: {}`).
