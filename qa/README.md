# QA: manual test scripts

Step-by-step scripts for a tester. Each case lists **steps** and **what you should see**.
They follow [spec/](../spec/); the automated tests in [tests/](../tests/) cover the same cases.

| Script | Area |
| --- | --- |
| [01-setup.md](01-setup.md) | Install, help, usage errors |
| [02-cli-scan.md](02-cli-scan.md) | `scan` on local directories: discovery, grouping, order, warnings |
| [03-cli-github.md](03-cli-github.md) | `scan` on GitHub repositories and the errors around them |
| [04-web-repository.md](04-web-repository.md) | Web view: scanning a repository |
| [05-web-filter.md](05-web-filter.md) | Web view: the filter |
| [06-web-organization.md](06-web-organization.md) | Web view: organizations |
| [07-web-api.md](07-web-api.md) | HTTP API: status codes and JSON |
| [08-host-check.md](08-host-check.md) | DNS-rebinding protection (`Host` check) |
| [09-github-action.md](09-github-action.md) | The issue-comment workflow |
| [10-web-project.md](10-web-project.md) | Web view: choosing a project |

## Before you start
- Node.js 24 or newer, `git`, `curl`, a browser.
- From the repository root: `npm ci`.
- GitHub cases need the network. Without a token GitHub allows 60 requests an hour, so
  `export GITHUB_TOKEN=<a personal access token>` before the GitHub scripts. If you see
  `GitHub rate limit reached; set GITHUB_TOKEN`, that is the token missing, not a bug.
- Commit hashes in links change as repositories move on; check the shape, not the exact hash.

## Recording a result
For each case write **Pass** / **Fail**; on Fail, attach the command or URL, what you saw and a screenshot.
