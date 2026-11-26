# 03 · CLI scan of a GitHub repository

Needs the network; set `GITHUB_TOKEN` (see [README](README.md)).

## 3.1 A public repository
**Steps**: `time ./skill-atlas scan https://github.com/JetBrains/kotlin`

**Expected**
- First line: `JetBrains/kotlin · N skills` (6 at the time of writing).
- Each skill: `name — first sentence`, then indented links
  `https://github.com/JetBrains/kotlin/blob/<40-char commit>/<path>/SKILL.md`.
- All links use the **same commit**; opening one shows the file at that commit.
- No `git clone` happens (nothing new on disk).

## 3.2 Speed on a big repository
**Steps**: `time ./skill-atlas scan https://github.com/JetBrains/intellij-community`

**Expected**: a full result in **under 5 s** (with a token, on a normal connection).

## 3.3 URL forms
**Steps**: scan the same repository as `https://github.com/JetBrains/kotlin/`, `github.com/JetBrains/kotlin`,
`https://www.github.com/JetBrains/kotlin.git`; then `https://github.com/JetBrains/kotlin/tree/master`.

**Expected**: the first three give the same result as 3.1. The last one (a deeper path) is refused:
`Not a GitHub URL or a readable directory: https://github.com/JetBrains/kotlin/tree/master`, exit code `1`.

## 3.4 Missing repository
**Steps**: `./skill-atlas scan https://github.com/JetBrains/no-such-repo-qa; echo $?`

**Expected**: `Repository not found: https://github.com/JetBrains/no-such-repo-qa`, exit code `1`.

## 3.5 Rate limit without a token
**Steps**: `unset GITHUB_TOKEN`, then scan repeatedly until GitHub refuses (or use a network already limited).

**Expected**: `GitHub rate limit reached; set GITHUB_TOKEN`, exit code `1`, no stack trace.

## 3.6 Rejected token
**Steps**: `GITHUB_TOKEN=bogus ./skill-atlas scan https://github.com/JetBrains/kotlin; echo $?`

**Expected**: `GitHub rejected the token in GITHUB_TOKEN`, exit code `1`.

## 3.7 Unreachable GitHub
**Steps**: disconnect the network (Wi-Fi off, or block `api.github.com` in `/etc/hosts`), scan 3.1.

**Expected**: `Cannot reach GitHub: …`, exit code `1`, no stack trace.

## 3.8 Private repository (optional)
**Steps**: with a token that can read a private repository, scan it; then scan it without the token.

**Expected**: with the token, its skills are listed; without, `Repository not found: …`.
For an organization with SAML SSO the token is not authorized for: the message ends with
`if it is private, authorize GITHUB_TOKEN for the organization's SAML SSO`; public repositories still scan.
