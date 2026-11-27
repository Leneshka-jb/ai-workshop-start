# 10 · Web view: choosing a project

Spec: [web.md](../spec/web.md#project). Use a repository whose skills live in several projects,
e.g. `https://github.com/JetBrains/intellij-community`. Scan it once; nothing below scans again.

## 10.1 The selector
**Steps**: scan the repository.

**Expected**: next to the filter, a selector holding `All projects`, then `(repository root) · N skills` (if the root has
skills), then each project path with its number of skills, sorted by path. `All projects` is chosen.

## 10.2 One project only
**Steps**: choose a project.

**Expected**: the header becomes `<owner>/<repo> · <project> · N skills`; the table lists only that project's skills,
and their Links column shows only the links inside that project. No `Scanning…`, no request in the Network tab.

## 10.3 With the filter
**Steps**: with a project chosen, type part of a skill's name in the filter.

**Expected**: `… · <project> · M of N skills`, N being that project's skills; `No matching skills` when nothing matches.

## 10.4 Back to every project, and a new scan
**Steps**: choose `All projects`; then choose a project and scan another repository.

**Expected**: every skill again; after the new scan, `All projects` is chosen again.

## 10.5 Not shown
**Steps**: scan a repository whose skills are all in one project (e.g. all under its root `.claude/skills/`), an organization and a bad link.

**Expected**: no project selector in any of the three.
