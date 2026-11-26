# GitHub Action
`.github/workflows/issue-comment.yml` listens for `issue_comment` events (`created`), on issues and pull requests.
## Command
A comment whose **first line** is `/scan <GitHub URL>` scans that repository, as in [analysis](analysis.md).
- Any other comment is ignored: no reply
- Only from the repository's owner, members and collaborators; never from bots
- `GITHUB_TOKEN` is the workflow's token. *Nothing is stored.*
## Reply
One comment on the same issue or pull request:
- The CLI's output ([cli](cli.md)) in a code block, so repository text is never Markdown and never mentions anyone
- Warnings in a collapsed list below it
- Not a GitHub repository URL, a missing or extra argument, or any scan error → the message, in a code block; local directories are **not** accepted
- The comment body is untrusted: it reaches the scan only through the environment, never the workflow script
