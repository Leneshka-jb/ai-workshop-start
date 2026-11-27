# Web view
`./skill-atlas serve [port]` starts a local web server on `127.0.0.1` (port 3000 by default) and prints its address.
`GITHUB_TOKEN`, optional, as for the CLI. *Nothing is stored.*
## Page
`GET /`: an input for a **GitHub repository link** or a **GitHub organization link**, and a *Scan* button.
After a repository scan, the page shows the header described in [Filter](#filter), the filter input and the [project](#project) selector under it, then a table of the skills as in [analysis](analysis.md):
- Columns **Name**, **Description**, **Links**; one row per skill: its name, the full description (empty if none), and every **link**, labelled with its path, opening the pinned GitHub file
- Styled: coloured column headings, striped and highlighted rows, links as path labels; follows the system light or dark theme
- No skills to show (none found, or none matching) → no table
- Same grouping and order as the CLI; warnings in a collapsed list below the skills
- Any error replaces the result with its message

An organization link (`https://github.com/<owner>`, one path segment) lists its repositories instead, as in [analysis](analysis.md#organization):
- `<owner> · N repositories`, then a table with the columns **Repository**, **Skills** and one without a heading; one row per repository: its `owner/name` linking to it on GitHub, and `N skills`, or `not scanned`
- Each repository has a *Scan* button that scans it as if its link had been entered
- Warnings in a collapsed list below the repositories
Repository text is shown as text, never as HTML.
## Filter
A second input, shown only under the header of a repository result (hidden before the first scan, while scanning, for an organization and on an error):
- Smaller than the link input; no button of its own, not even the browser's clear button
- Applied on every keystroke, in the page, to the skills of the last scan: typing never scans again
- Its text is kept when another repository is scanned, and applied to the new result

The filter text, trimmed, keeps the skills whose **name** or **description** contains it, ignoring case (locale-independent).
- An empty filter keeps every skill, and the page shows `<owner>/<repo> · N skills`
- Otherwise the page shows `<owner>/<repo> · M of N skills`: M skills match, of N found
- Nothing matches → `<owner>/<repo> · No matching skills`
- No skills found even before filtering, with or without a filter → `<owner>/<repo> · No skills found`
- Matches keep the order of the scan; warnings are not filtered
## Project
A repository may hold several projects; a selector, next to the filter, lists only the skills of one of them.
- A link's project: the directories of its path before the first hidden directory (`.agents`, `.claude`, …) or one named `skills`; with neither, the directories above the skill's own directory. None left → the repository root
  - `plugins/kotlin/.claude/skills/gradle/SKILL.md` → `plugins/kotlin`; `plugins/java/skills/review/SKILL.md` → `plugins/java`; `tools/lint/SKILL.md` → `tools`; `.agents/skills/setup/SKILL.md` → root
- A skill belongs to the project of each of its links, so a skill copied into two projects is in both
- Options: `All projects` (chosen after every scan), then `(repository root) · N skills` first, then every other project sorted by path (case-sensitive, locale-independent), as `<project> · N skills`
- Shown only for a repository result with two or more projects; hidden like the filter otherwise
- Choosing a project, in the page, never scans again: the table keeps the skills with a link in it, and shows only those links
- The filter applies within the chosen project; the header becomes `<owner>/<repo> · <project> · …` (`(repository root)` for the root), its counts as in [Filter](#filter) with N the skills of that project
## Host check
Answer only requests addressed to this server, so a page that rebinds its own domain to `127.0.0.1` cannot scan with `GITHUB_TOKEN` (DNS rebinding).
- Accepted `Host`: `localhost`, `127.0.0.1` or `[::1]` with the server's port, case-insensitive
- In a GitHub Codespace, also its forwarded address `<CODESPACE_NAME>-<port>.<GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN>`
- Any other or missing `Host` → `421` and `{ error }`, before anything else is done
## API
`GET /api/scan?repo=<GitHub URL>[&filter=<text>]` → `200` with the scan result as JSON: `{ repository, skills, total, warnings }` (see [analysis](analysis.md)).
- `skills`: the skills that match the filter (all of them without one); `total`: the number of skills before filtering
- Not a GitHub repository URL → `400` and `{ error }`; local directories are **not** accepted
- Unreachable or missing repository, rate limit → `502` and `{ error }` with the CLI's message
`GET /api/organization?org=<GitHub organization URL>` → `200` with `{ organization: { id, url }, repositories: [{ id, name, url, skills }], warnings }`; `skills` is the number of unique skills, or `null` for a repository that could not be scanned.
- Not a GitHub organization URL → `400` and `{ error }`
- Missing organization, unreachable GitHub, rate limit → `502` and `{ error }`

Both endpoints:
- Unknown path → `404`; methods other than `GET` → `405`
- An unreadable request URL → `400`; any unexpected error → `500` and `{ error }`. No request stops the server
