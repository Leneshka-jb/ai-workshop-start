# 05 · Web view: filter

Use a repository with several skills, e.g. `https://github.com/JetBrains/kotlin` (N skills, per 04 · 4.3).
Scan it once; every step below only types into the filter, and nothing is scanned again.

## 5.0 Placement and look
**Steps**: open the page; then scan the repository.

**Expected**: before the scan there is no filter input. After it, the filter input
(`Filter by name or description`) sits right under `JetBrains/kotlin · N skills`, visibly smaller than the
link input, with no button of its own: no *Scan*/*Filter* button next to it and no clear (×) button
while it holds text.

## 5.1 Empty filter
**Steps**: leave the filter empty (or type only spaces).

**Expected**: `JetBrains/kotlin · N skills`, every skill.

## 5.2 Match by name
**Steps**: type part of one skill's name, e.g. `gradle`, one letter at a time.

**Expected**: the header and the cards change at every keystroke, with no `Scanning…` and no request in the
Network tab; finally `JetBrains/kotlin · M of N skills`, only skills with `gradle` in the name **or**
description, in the same order as 5.1. Deleting the text brings every skill back.

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

## 5.7 No filter for organizations or errors
**Steps**: with a filter typed, enter `https://github.com/JetBrains`, click **Scan**; then scan `https://gitlab.com/a/b`.

**Expected**: the full repository list (see 06) with no filter input; then the error, with no filter input.

## 5.8 The filter text is kept for the next scan
**Steps**: with `gradle` in the filter, scan another repository (e.g. from an organization's list).

**Expected**: the filter still holds `gradle`, and the new result is already filtered by it.
