# Repository analysis
## Skill definition
A skill is defined by the contents of a `SKILL.md` file.
All `SKILL.md` files with identical contents are considered the same skill, regardless of repository or path.
Equality is byte-for-byte, without normalizing whitespace, line endings, or front matter.
## Input
A **GitHub repository** URL, or a local directory
Each scan groups files within that one input; results are not merged across scans.
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
