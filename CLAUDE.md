# Kore-Chamber — Project Rules

## Overview

Kore Chamber is a standalone CLI that turns Claude JSONL conversations into structured Obsidian notes.

- **Runtime**: TypeScript on Node.js 18+
- **CLI**: `kore-chamber` (`init`, `collect`, `profile`, `explore`, `status`, `doctor`, `mcp`)
- **Input**: Claude JSONL logs from `~/.claude/projects/`
- **Output**: Obsidian vault notes in Kore Protocol shape
- **Auth**: Claude CLI OAuth (interactive `claude` → `/login`)
- **State**: `~/.kore-chamber/config.yaml`, `~/.kore-chamber/processed.yaml`

## Architecture

```text
CLI
  → JSONL parser
  → LLM extraction
  → dedup / merge judgment
  → vault writer
  → MOC / related linker
```

- **Code handles**: JSONL parsing, noise filtering, dedup, vault I/O, MOC linking, related-note linking, processed-session tracking
- **AI handles**: knowledge extraction, borderline merge-vs-skip judgment, merge drafting

## Vault Structure

```text
vault/
├── AI-GUIDE.md
├── MY-PROFILE.md
├── 00-Inbox/
├── 10-Concepts/
├── 20-Troubleshooting/
├── 30-Decisions/
├── 40-Patterns/
├── 50-MOC/
└── Templates/
```

## Product Notes

- `collect` defaults to the latest unprocessed session.
- `collect --all` processes every unprocessed session.
- `collect --session <id>` bypasses tracker filtering.
- `explore` is reserved and intentionally unimplemented in this version.
- `mcp` remains optional manual integration, not an auto-installed Claude add-on.
