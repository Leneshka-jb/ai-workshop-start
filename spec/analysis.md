# Repository analysis
## Skill definition
A skill is defined by the contents of a `SKILL.md` file.
All `SKILL.md` files with identical contents are considered the same skill, regardless of repository or path.
Equality is byte-for-byte, without normalizing whitespace, line endings, or front matter.
## Input
A **GitHub repository** URL, or a local directory
Each scan groups files within that one input; results are not merged across scans.
## Organization
A **GitHub organization** URL, `https://github.com/<owner>` (also a user account): every repository it owns, each with its number of skills.
- Repositories are listed through the GitHub API, page by page until the last; with a token, also the private ones it can see
- Each repository is scanned on its own, as a repository URL would be: its count is its unique skills; nothing is grouped across repositories
- Repositories are sorted by `owner/name`, case-sensitive and locale-independent
- A repository that cannot be scanned (empty, missing at its default branch, …) → listed without a count and a *warning*; the others are still scanned
- A repository's own warnings are kept, prefixed with `owner/name: `
- Missing organization → `Organization not found: https://github.com/<owner>`; unreachable GitHub, rate limit or a rejected token stops the whole scan with the repository scan's message
## Search scope
Search the whole project recursively for `SKILL.md` files, including the project root and all nested and hidden directories.
Skip `.git` and `node_modules` directories at every depth. Only regular files named exactly `SKILL.md` are skills; do not follow symbolic links.
Skills may be located anywhere in the project; discovery is not limited to conventional skill directories such as `.agents/skills` or `.claude/skills`.
This scope applies to both GitHub repositories and local directories.
GitHub discovery uses the scanned commit's tree, with or without a token. If a recursive listing is truncated, traverse its subtrees until the whole search scope is covered; do not return a partial scan if a directory cannot be fully listed.
## Output
Each skill: **name**, **description**, **links** (one or more)
## Architecture
Core: fetch → find → group → parse. CLI: a *thin client*.
Skill: id, content, name, description, links
Content: the complete decoded UTF-8 file text, including front matter and original whitespace
Link: repository, path, url, commit (for GitHub sources; omitted for local files)
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory of the first source location; a root-level file uses the repository name
- The skill ID is the first `repo:path` after sorting all of its source locations alphabetically
- Source locations use case-sensitive, locale-independent string order; adding an earlier location changes the ID
- A skill may have multiple links, one for each source location
- Links follow source-location order; skills are sorted by name, then ID
- All links for a skill must point to files with identical contents
- Each GitHub link pins the *scanned commit* of its repository
- Malformed front matter → a *warning* for each source file, the scan goes on
- A listed but missing file → a *warning* and no link; other files are still scanned
- Unreachable repository → a clear message, exit code 1
- Token refused for an organization's SAML SSO → retry without the token, and scan the rest of that repository without it; public repositories still scan
- Still not found without the token → a message to authorize `GITHUB_TOKEN` for the organization's SAML SSO
