---
name: update-memory
description: Save and recall durable user preferences, architecture decisions, and project conventions across sessions. Use when the user states a lasting preference, makes a technical decision, or starts a task that depends on prior context.
---

## When to Read Memory
- At the start of a coding or planning task involving an existing repository or user workflow.
- Before proposing architectural patterns, naming conventions, tooling, or response formats.

## When to Write Memory
Save a memory entry only when information is **durable** and **actionable**:
- User preferences (e.g., preferred language, test runner, formatting style).
- Confirmed decisions (e.g., chosen database, auth flow, API conventions).
- Recurring pitfalls or fixes verified during work.

Do **not** save:
- User input being added to a skill, `AGENTS.md`, or another file that configures or instructs agents; keep it in that file without duplicating it in memory.
- Temporary debug output, one-off commands, or unverified guesses.
- Secrets, API keys, passwords, or sensitive personal data.

## How to Format Entries
Write each memory in a new file in `memory/` with a filename that matches the memory's date and type, e.g., `memory/2026-11-26_decision_use_pytest.md`.
Keep each entry concise, dated, and easy to scan:
- `[2026-11-26] [Decision] Use pytest with fixtures under tests/unit; avoid mocking external HTTP in integration tests.`
- `[2026-11-26] [Preference] Prefer concise bullet points and code diffs over full-file rewrites.`

## Conflict & Cleanup Rules
- If a new instruction contradicts an older entry, update or supersede the old entry rather than keeping conflicting rules.
- Consolidate repetitive notes during periodic reviews so instructions stay brief and high-signal.
  Use code with caution.
