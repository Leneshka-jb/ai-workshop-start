# 01 · Setup and usage

## 1.1 Fresh install
**Steps**
1. Clone the repository into an empty directory, `cd` into it.
2. Run `npm ci`.
3. Run `npm test`.

**Expected**
- `npm ci` finishes without errors.
- `npm test` ends with `# fail 0`.

## 1.2 Help
**Steps**
1. Run `./skill-atlas help`, then `./skill-atlas` with no arguments.

**Expected** — both print, and exit with code 0 (`echo $?` → `0`):
```
Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it
  serve [port]                    open the web view on http://localhost:<port> (default 3000)
  help                            show this help
```

## 1.3 Unknown command
**Steps**: `./skill-atlas frobnicate; echo $?`

**Expected**: `Unknown command: frobnicate`, a blank line, the usage above; exit code `1`.

## 1.4 Wrong number of arguments
**Steps**
1. `./skill-atlas scan; echo $?`
2. `./skill-atlas scan ./fixture ./fixture; echo $?`

**Expected**: both print `Usage: skill-atlas scan <GitHub URL | directory>`, exit code `1`.

## 1.5 Missing dependencies
**Steps**: in a checkout without `node_modules`, run `./skill-atlas scan ./fixture`.

**Expected**: Node fails with `Cannot find package 'yaml'`. This is expected: run `npm ci` first (1.1).
