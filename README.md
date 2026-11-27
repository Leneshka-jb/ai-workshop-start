# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and all source links. Files with identical contents are grouped into one skill.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas save <URL | organization URL | directory> <file>` writes the result to a file, and
`./skill-atlas load <file>` prints it again later without GitHub; [spec/store.md](spec/store.md) has the format.
[data/jetbrainsSkills.txt](data/jetbrainsSkills.txt) holds every skill of the JetBrains organization.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

`./skill-atlas serve` opens a web view on http://localhost:3000: paste a GitHub repository link to see its skills, optionally filtered by name or description,
or an organization link (`https://github.com/<owner>`) to list its repositories with the number of skills in each.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
