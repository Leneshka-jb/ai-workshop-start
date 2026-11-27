# 11 · Web view: clusters of the saved skills

Spec: [web.md](../spec/web.md#clusters). Start `./skill-atlas serve` and open the page. No GitHub token or network needed.

## 11.1 Clasterize
**Steps**: click *Clasterize*, next to the link form, without scanning anything.

**Expected**: a section opens under the link form: `N skills · M clusters` (N = the non-blank lines of
`data/jetbrainsSkills.txt`) and a *Hide* button, then one box per cluster, `<word> · K skills`, biggest first, with
the skill names; `Unclustered · K skills` is the last box. Hovering a name shows its description. No `/api/scan`
request in the Network tab, only `/api/clusters`.

## 11.2 Hide, and again
**Steps**: click *Hide*; then *Clasterize* again.

**Expected**: the whole section disappears; it comes back with the same clusters.

## 11.3 With a scan
**Steps**: with the clusters shown, scan a repository, type in the filter, and scan an organization.

**Expected**: the clusters stay above the result as they were; the scan result appears under them.

## 11.4 The file cannot be read
**Steps**: stop the server, rename `data/jetbrainsSkills.txt`, start it again and click *Clasterize*; rename it back.

**Expected**: the section shows `Cannot read data/jetbrainsSkills.txt: ENOENT` in red.
