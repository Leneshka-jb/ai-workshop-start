# 04 · Web view: scanning a repository

Spec: [web.md](../spec/web.md).

## 4.1 Start the server
**Steps**
1. `./skill-atlas serve` → open the printed address.
2. Stop it, run `./skill-atlas serve 3123`.
3. While it runs, start a second `./skill-atlas serve 3123`.

**Expected**
1. `Skill Atlas web view: http://localhost:3000`; the page shows a link input
   (placeholder `https://github.com/owner/repo or https://github.com/owner`) and a **Scan** button;
   no filter input yet (it appears under the header of a scanned repository, see 05).
2. `…http://localhost:3123`.
3. The second one fails with `Cannot start the web view: …EADDRINUSE…`, exit code `1`; the first keeps running.

## 4.2 Bound to localhost only
**Steps**: from another machine on the network, open `http://<this machine's IP>:3000`.

**Expected**: the connection is refused.

## 4.3 Scan a repository
**Steps**: enter `https://github.com/JetBrains/kotlin`, click **Scan**.

**Expected**
- While scanning: `Scanning…`, the button is disabled.
- Then the header `JetBrains/kotlin · N skills`, a small filter input under it (and the project selector, see 10), and a table with
  coloured headings **Name · Description · Links**, one striped row per skill, in the CLI's order (compare with 03 · 3.1):
  the name, the **full** description (not just the first sentence), and each link as a label with its path.
- The table follows the system light/dark theme; rows highlight on hover.
- Clicking a link opens the pinned file on GitHub in a new tab.

## 4.4 Enter also submits
**Steps**: put the cursor in the link input and press **Enter**.

**Expected**: same as clicking **Scan**.

## 4.5 Warnings
**Steps**: scan a repository with malformed front matter (e.g. push [fixture/](../fixture/) to a test repository and scan it).

**Expected**: below the skills, a **collapsed** `1 warning` line; expanding it shows
`.agents/skills/release-checklist/SKILL.md: malformed front matter: …`. With no warnings, nothing is shown.

## 4.6 Errors replace the result
**Steps**
1. Scan 4.3 so results show.
2. Scan `https://github.com/JetBrains/no-such-repo-qa`.
3. Scan `https://gitlab.com/a/b`.

**Expected**
2. The previous cards disappear; only `Repository not found: https://github.com/JetBrains/no-such-repo-qa`, styled as an error.
3. `Not a GitHub repository URL: https://gitlab.com/a/b`.

## 4.7 Text is never HTML
**Steps**: in a test repository, add a `SKILL.md` with
`name: <img src=x onerror=alert(1)>` and `description: <b>bold</b>`; scan it.

**Expected**: the name and description appear literally, angle brackets visible; no alert, no bold text.

## 4.8 Local directories are refused
**Steps**: enter `./fixture` (bypass the browser's URL check with DevTools, or use 07 · 7.3).

**Expected**: `Not a GitHub repository URL: ./fixture`.
