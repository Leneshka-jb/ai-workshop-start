# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests

## Skills
- [demo](.claude/skills/demo/SKILL.md): record a short video of the web view (organization scan and filter) into `docs/demo/`

## Memory
- Notes are stored in [memory/](memory/); search them when relevant context is needed.
- At the end of every task, use [update-memory](.agents/skills/update-memory/SKILL.md) to save durable, actionable knowledge.
