# 08 · Host check (DNS rebinding)

Start `./skill-atlas serve 3123`.

## 8.1 Accepted hosts
**Steps**
```sh
for h in localhost:3123 127.0.0.1:3123 '[::1]:3123' LOCALHOST:3123; do
  curl -s -o /dev/null -w "$h %{http_code}\n" -H "Host: $h" http://127.0.0.1:3123/
done
```
**Expected**: all `200`.

## 8.2 Rejected hosts
**Steps**: repeat with `evil.example:3123`, `localhost:3000` (wrong port), `localhost` (no port),
`127.0.0.1.nip.io:3123`; and with no `Host` at all: `curl --http1.0 -H 'Host:' http://127.0.0.1:3123/`.

**Expected**: each `421` with `{"error":"Unknown host"}`.

## 8.3 Rejected before any work
**Steps**: `curl -i -H 'Host: evil.example:3123' "http://127.0.0.1:3123/api/scan?repo=https://github.com/JetBrains/kotlin"`
and `curl -i -X POST -H 'Host: evil.example:3123' http://127.0.0.1:3123/nope`.

**Expected**: both `421` (not 200, 404 or 405); the server makes no GitHub request (instant answer, no rate-limit use).

## 8.4 GitHub Codespaces (only in a Codespace)
**Steps**: in a Codespace, run `./skill-atlas serve`, open the forwarded port in the browser
(`https://$CODESPACE_NAME-3000.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`), scan a repository.

**Expected**: the page loads and scans. A different Codespace name in `Host` → `421`.
