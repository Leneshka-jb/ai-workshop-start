# 07 · HTTP API

Start `./skill-atlas serve 3123`; `B=http://127.0.0.1:3123`. Add `-i` to `curl` to see the status line.

| # | Request | Expected status | Expected body |
| --- | --- | --- | --- |
| 7.1 | `curl "$B/api/scan?repo=https://github.com/JetBrains/kotlin"` | 200 | `{ repository, skills, total, warnings }`; `skills.length == total` |
| 7.2 | `curl "$B/api/scan?repo=https://github.com/JetBrains/kotlin&filter=gradle"` | 200 | `skills` only the matching ones; `total` unchanged from 7.1 |
| 7.3 | `curl "$B/api/scan?repo=./fixture"` | 400 | `{"error":"Not a GitHub repository URL: ./fixture"}` |
| 7.4 | `curl "$B/api/scan"` | 400 | `{"error":"Not a GitHub repository URL: "}` |
| 7.5 | `curl "$B/api/scan?repo=https://github.com/JetBrains/no-such-repo-qa"` | 502 | `{"error":"Repository not found: …"}` |
| 7.6 | `curl "$B/api/organization?org=https://github.com/<owner>"` | 200 | `{ organization: { id, url }, repositories: [{ id, name, url, skills }], warnings }`; `skills` a number or `null` |
| 7.7 | `curl "$B/api/organization?org=https://github.com/a/b"` | 400 | `{"error":"Not a GitHub organization URL: https://github.com/a/b"}` |
| 7.8 | `curl "$B/api/organization?org=https://github.com/no-such-owner-qa-123456"` | 502 | `{"error":"Organization not found: …"}` |
| 7.9 | `curl "$B/nope"` | 404 | `{"error":"Not found"}` |
| 7.10 | `curl -X POST "$B/api/scan"` (also `PUT`, `DELETE` on `/`) | 405 | `{"error":"Method not allowed"}` |
| 7.11 | `GITHUB_TOKEN=bogus` server, then 7.1 | 502 | `{"error":"GitHub rejected the token in GITHUB_TOKEN"}` |

**Also check**
- After every request above, the server is still running and 7.1 still answers (no request stops it).
- Responses are JSON (`Content-Type: application/json`).
- `GET /` returns the HTML page (200).
