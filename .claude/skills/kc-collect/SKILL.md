---
name: kc-collect
description: Save the current Claude Code session into the Kore Chamber vault.
disable-model-invocation: true
allowed-tools: Bash(kore-chamber collect *), Read(~/.kore-chamber/**)
argument-hint: [--dry-run]
model: sonnet
effort: low
---

Run the Kore Chamber collect engine for the current Claude Code session.

1. Execute:
   `kore-chamber collect --session ${CLAUDE_SESSION_ID} --output json $ARGUMENTS`

2. If the command fails:
   - show the error clearly
   - do not improvise or simulate results

3. If it succeeds:
   - parse the JSON
   - present a concise summary:
     - transcript used
     - turns parsed
     - extracted items
     - stored notes (with folder and slug)
     - merged notes (with merge target)
     - skipped duplicates (with reason)
     - MOC links added
     - related links added
     - batch links added
     - applied profile updates
     - pending medium-confidence profile updates

4. If there are pending medium-confidence profile updates (`profileUpdatesPending`):
   - list each one with its dimension and summary
   - ask the user whether to apply them
   - if approved, run for each:
     `kore-chamber profile apply --id <pending_id> --output json`

Never perform AI-only collection logic in this skill. The CLI is the source of truth.
