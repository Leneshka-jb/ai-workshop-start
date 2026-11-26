# GitHub Action
`.github/workflows/issue-comment.yml` listens for `issue_comment` events (`created`, `edited`, `deleted`), on issues and pull requests.
## Request
Each event → one `POST` to the Air automation:
`https://api.jetbrains.cloud/air-automations-gateway/api/v1/events/automations/a042fce6-99f4-4b00-a952-609d6ef6727c`
- Headers: `Authorization: ApiKey <key>` and `Content-Type: application/json`
- Body: the GitHub event payload, byte for byte
- The key comes from the `AIR_AUTOMATION_API_KEY` repository secret, never from the repository; missing → the job fails with a message, nothing is sent
- Comments from bots are not sent, so an automation that comments cannot trigger itself
- The comment text never reaches the shell script; the workflow token has no permissions
- An error response or an unreachable gateway → the job fails
