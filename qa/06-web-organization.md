# 06 · Web view: organization

Spec: [analysis.md § Organization](../spec/analysis.md#organization). Set `GITHUB_TOKEN`: an organization costs one request per repository and more.

## 6.1 List an organization
**Steps**: enter `https://github.com/<a small organization or user>` (e.g. your own account), click **Scan**.

**Expected**
- Header `<owner> · N repositories` (`1 repository` for one).
- One row per repository: `owner/name` linking to `https://github.com/owner/name` (new tab), then `K skills` (`1 skill`, `0 skills`) or `not scanned`, and a **Scan** button.
- Rows sorted by `owner/name`, case-sensitive: uppercase names before lowercase ones.
- Every repository is listed, even beyond 100 (try an organization with more than 100 repositories).

## 6.2 Per-repository Scan
**Steps**: click **Scan** on a row with skills.

**Expected**: the link input changes to that repository's URL and the page shows its skills, exactly as if its link had been entered (04 · 4.3). The count matches the row's `K skills`.

## 6.3 A repository that cannot be scanned
**Steps**: create an empty repository in your account; list your account.

**Expected**: its row shows `not scanned`; other rows still have counts. A collapsed warnings list includes
`owner/name: …; not scanned`. A repository's own warnings (e.g. malformed front matter) are prefixed with `owner/name: `.

## 6.4 Private repositories
**Steps**: list an organization you belong to, with a token that can see its private repositories; then without a token.

**Expected**: with the token, private repositories are listed and counted (not `not scanned`); without, only public ones.
For a **user** account, only public repositories are listed even with a token.

## 6.5 Missing organization
**Steps**: `https://github.com/no-such-owner-qa-123456`.

**Expected**: `Organization not found: https://github.com/no-such-owner-qa-123456`, as an error.

## 6.6 Global failure stops the scan
**Steps**: with `GITHUB_TOKEN=bogus ./skill-atlas serve`, list any organization.

**Expected**: no partial list; only `GitHub rejected the token in GITHUB_TOKEN`.
