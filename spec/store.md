# Saved file
`./skill-atlas save <GitHub URL | GitHub organization URL | directory> <file>` scans as [analysis](analysis.md) does and writes the result to the file; `./skill-atlas load <file>` prints it later, without scanning.
`GITHUB_TOKEN`, optional, as for `scan`.
## Save
- A repository URL or a directory → one repository; an organization URL (`https://github.com/<owner>`) → every repository it owns, each scanned on its own, as in [Organization](analysis.md#organization)
- Prints `Saved N repositories, M skills to <file>`; warnings go to *stderr*, as `warning: <text>`, and are saved too
- Missing directories of the path are created; an existing file is replaced
- The file is written only after the whole scan: a failed scan (exit code 1, its message) or a failed write leaves an existing file as it was
## Format
UTF-8 text, [JSON Lines](https://jsonlines.org): one JSON object per line, `\n` after every line, keys in the order below.
1. A header: `{"type":"skill-atlas","version":1,"organization":<{"id","url"} | null>,"repositories":N}`; `organization` is `null` for a repository or a directory
2. For each repository, in scan order (sorted by `owner/name` for an organization):
   - `{"type":"repository","id","organization","name","url","commit","skills":N}`, as `Repository` in [analysis](analysis.md#architecture); `skills` is `null` for a repository that could not be scanned, and `commit` then is `""`
   - then its `N` skills, in scan order: `{"type":"skill","id","name","description","links":[{"repository","path","url","commit"}],"content"}`; `commit` is omitted for local files, `content` is the complete file text
3. `{"type":"warning","text"}` for each warning, in scan order, last

Example:
```
{"type":"skill-atlas","version":1,"organization":null,"repositories":1}
{"type":"repository","id":"JetBrains/example","organization":"JetBrains","name":"example","url":"https://github.com/JetBrains/example","commit":"5ab6…","skills":1}
{"type":"skill","id":"JetBrains/example:.claude/skills/commits/SKILL.md","name":"commits","description":"Write commit messages…","links":[{"repository":"JetBrains/example","path":".claude/skills/commits/SKILL.md","url":"https://github.com/JetBrains/example/blob/5ab6…/.claude/skills/commits/SKILL.md","commit":"5ab6…"}],"content":"---\nname: commits\n…"}
```
## Load
- A repository file prints exactly what `scan` printed for it, warnings on *stderr*
- An organization file prints `<owner> · N repositories`, then each repository after an empty line: as `scan` prints it, or `<owner>/<name> · not scanned`
- Loading never reaches GitHub; the skills, links and contents are those saved
## Errors
Each → a message, exit code 1:
- Unreadable file → `Cannot read <file>: …`
- First line not a skill-atlas header → `Not a skill-atlas file: <file>`
- Another `version` → `<file>: unsupported skill-atlas file version <version>; expected 1`
- A line that is not a JSON object, an unknown `type`, a missing or mistyped field, a skill outside a scanned repository, a repository or skill after the warnings, a skill count that does not match → `<file>: line <n>: <reason>`
- Fewer or more repositories than the header says → `<file>: expected N repositories, found M; the file is incomplete`
