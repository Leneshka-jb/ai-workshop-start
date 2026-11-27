# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*. To keep a result, `save` it to a file and `load` it later: [store](store.md).
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Counts unique skills, grouping files with identical contents
- Sorted by **name**, then skill ID; the description's *first sentence*
- Every source URL on its own indented line, ordered by `repo:path`; warnings go to *stderr*
