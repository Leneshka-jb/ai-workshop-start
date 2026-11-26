# 02 · CLI scan of a local directory

Spec: [cli.md](../spec/cli.md), [analysis.md](../spec/analysis.md).
Cases 2.3–2.8 use a scratch directory: `export T=$(mktemp -d)`.

## 2.1 The fixture
**Steps**: `./skill-atlas scan ./fixture; echo $?`

**Expected** (stdout; `<root>` is your checkout's absolute path):
```
fixture · 3 skills
code-style — Follow the project's code style.
  file://<root>/fixture/.github/skills/code-style/SKILL.md
commits — Write commit messages the way this repository does.
  file://<root>/fixture/.claude/skills/commits/SKILL.md
release-checklist
  file://<root>/fixture/.agents/skills/release-checklist/SKILL.md
```
- The header is `<directory name> · N skills`.
- Skills are sorted by name; each shows only the **first sentence** of its description.
- On **stderr**, one warning (check with `2>/dev/null`: it disappears):
  `warning: .agents/skills/release-checklist/SKILL.md: malformed front matter: …; using the directory name`
- `release-checklist` has no description and is named after its directory. Exit code `0`.

## 2.2 Output is immediate, nothing is stored
**Steps**: run 2.1 under `git status` before and after.

**Expected**: the result prints at once; no new files appear anywhere in the checkout.

## 2.3 Identical files are one skill
**Steps**
```sh
mkdir -p $T/a $T/b/c
printf -- '---\nname: same\ndescription: One skill. Twice.\n---\n' > $T/a/SKILL.md
cp $T/a/SKILL.md $T/b/c/SKILL.md
./skill-atlas scan $T
```
**Expected**: `· 1 skill`, then `same — One skill.` with **two** indented links: `…/a/SKILL.md` first, then `…/b/c/SKILL.md`.

## 2.4 Byte-for-byte equality
**Steps**: append a single space (or convert line endings to CRLF) in `$T/b/c/SKILL.md`, scan again.

**Expected**: `· 2 skills`, both named `same`, each with one link. Whitespace or line endings are not normalized.

## 2.5 Discovery everywhere, but not in `.git` or `node_modules`
**Steps**
```sh
rm -rf $T/*; cd $T
printf 'root\n' > SKILL.md
mkdir -p .hidden/deep/x node_modules/p sub/node_modules/q .git/s docs
printf 'hidden\n' > .hidden/deep/x/SKILL.md
printf 'nm\n'     > node_modules/p/SKILL.md
printf 'nm2\n'    > sub/node_modules/q/SKILL.md
printf 'git\n'    > .git/s/SKILL.md
printf 'lower\n'  > docs/skill.md
cd -; ./skill-atlas scan $T
```
**Expected**: exactly 2 skills — the root file (named after the scanned directory) and `x` (from `.hidden/deep/x`).
Nothing from `node_modules` at any depth, `.git`, or `skill.md` (the name must be exactly `SKILL.md`).
On stderr, a `no front matter; using the directory name` warning for each of the two files.

## 2.6 Symbolic links are not followed
**Steps**: `ln -s $T/.hidden $T/link; ln -s $T/SKILL.md $T/docs/SKILL.md; ./skill-atlas scan $T`

**Expected**: the same 2 skills as 2.5, no links through `link/` or `docs/`.

## 2.7 Name and description from front matter
**Steps**
```sh
rm -rf $T/*; mkdir -p $T/dir-name
printf -- '---\nname: front-name\ndescription: First sentence. Second sentence.\n---\nBody\n' > $T/dir-name/SKILL.md
./skill-atlas scan $T
```
**Expected**: `front-name — First sentence.` (the front matter name wins over `dir-name`; only the first sentence).

## 2.8 Sort by name, then ID
**Steps**: create `$T/z/SKILL.md` and `$T/a/SKILL.md` with different contents but the same `name: dup`, and `$T/m/SKILL.md` with `name: alpha`. Scan.

**Expected**: `alpha` first, then `dup` from `a/`, then `dup` from `z/`.

## 2.9 Not a directory or URL
**Steps**: `./skill-atlas scan /nonexistent; echo $?`

**Expected**: `Not a GitHub URL or a readable directory: /nonexistent`, exit code `1`.
