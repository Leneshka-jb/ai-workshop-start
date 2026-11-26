# 05 · Web view: filter

Use a repository with several skills, e.g. `https://github.com/JetBrains/kotlin` (N skills, per 04 · 4.3).

## 5.1 Empty filter
**Steps**: leave the filter empty (or only spaces), click **Scan**.

**Expected**: `JetBrains/kotlin · N skills`, every skill.

## 5.2 Match by name
**Steps**: type part of one skill's name, e.g. `gradle`, click **Scan**.

**Expected**: `JetBrains/kotlin · M of N skills`; only skills with `gradle` in the name **or** description, in the same order as 5.1.

## 5.3 Match by description, any case, trimmed
**Steps**: take a word that appears only in a description; type it in UPPER CASE with spaces around it.

**Expected**: the skill(s) containing it are shown; case and surrounding spaces do not matter.

## 5.4 Nothing matches
**Steps**: filter `zzz-no-such-skill`.

**Expected**: `JetBrains/kotlin · No matching skills`, no cards.

## 5.5 Repository with no skills
**Steps**: scan a repository without any `SKILL.md` (e.g. `https://github.com/octocat/Hello-World`), first without, then with a filter.

**Expected**: both times `octocat/Hello-World · No skills found`.

## 5.6 Warnings are not filtered
**Steps**: on a repository with warnings (04 · 4.5), filter with a text that matches nothing.

**Expected**: `No matching skills`, but the warnings list still shows every warning.

## 5.7 Filter is ignored for organizations
**Steps**: enter `https://github.com/JetBrains` and any filter text, click **Scan**.

**Expected**: the full repository list (see 06); the filter changes nothing.
