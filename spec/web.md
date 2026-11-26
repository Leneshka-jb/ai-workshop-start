# Web view
`./skill-atlas serve [port]` starts a local web server on `127.0.0.1` (port 3000 by default) and prints its address.
`GITHUB_TOKEN`, optional, as for the CLI. *Nothing is stored.*
## Page
`GET /`: an input for a **GitHub repository link** and a *Scan* button.
After a scan, the page shows `<owner>/<repo> · N skills`, then each skill as in [analysis](analysis.md):
- **name**, the full **description** (if any), and every **link**, labelled with its path, opening the pinned GitHub file
- Same grouping and order as the CLI; warnings in a collapsed list below the skills
- Any error replaces the result with its message
Repository text is shown as text, never as HTML.
## Host check
Answer only requests addressed to this server, so a page that rebinds its own domain to `127.0.0.1` cannot scan with `GITHUB_TOKEN` (DNS rebinding).
- Accepted `Host`: `localhost`, `127.0.0.1` or `[::1]` with the server's port, case-insensitive
- In a GitHub Codespace, also its forwarded address `<CODESPACE_NAME>-<port>.<GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN>`
- Any other or missing `Host` → `421` and `{ error }`, before anything else is done
## API
`GET /api/scan?repo=<GitHub URL>` → `200` with the scan result as JSON: `{ repository, skills, warnings }` (see [analysis](analysis.md)).
- Not a GitHub repository URL → `400` and `{ error }`; local directories are **not** accepted
- Unreachable or missing repository, rate limit → `502` and `{ error }` with the CLI's message
- Unknown path → `404`; methods other than `GET` → `405`
- An unreadable request URL → `400`; any unexpected error → `500` and `{ error }`. No request stops the server
