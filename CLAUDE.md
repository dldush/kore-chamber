# Kore-Chamber — Project Rules

## Overview

AI-powered knowledge chamber for Obsidian vaults. Multi-agent system built on Claude Code skills + agents.

- **Runtime**: Claude Code (no separate backend)
- **Agent definitions**: `.claude/commands/` (skills) + `.claude/agents/` (subagents)
- **Config**: `~/.kore-chamber/config.yaml` (vault path)
- **Design doc**: Obsidian `70-Career/Projects/Kore-Chamber.md`

## Architecture

```
Skills (user-facing)          Agents (subagents)
─────────────────────         ──────────────────
/kc-promote                → librarian (type classify + MOC place + dedup)
/kc-seek (future)          → seeker → sentinel → judge → librarian
/kc-explore (future)       → judge + librarian
/kc-connect (future)       → librarian
```

## Agent Prompt Language

All agent/skill prompts (.md files) are written in **English**.
User-facing output language is detected from `MY-PROFILE.md` or `init-answers.yaml`.

## Vault Structure (target)

```
vault/
├── AI-GUIDE.md         ← Vault structure + navigation rules
├── MY-PROFILE.md       ← User profile
├── 00-Inbox/           ← Unclassified
├── 10-Concepts/        ← "What is X?"
├── 20-Troubleshooting/ ← "Error → Cause → Fix"
├── 30-Decisions/       ← "Why B instead of A?"
├── 40-Patterns/        ← Reusable implementation
├── 50-MOC/             ← Domain indexes
├── 90-Library/         ← AI-collected (agent-only, isolated)
│   └── _index.md
└── Templates/
```

> Personal folders (60-Thinking, 70-Career, etc.) are NOT part of the standard structure.
> Agents only operate on 00-50 + 90-Library. Users add personal folders freely.

## Type Classification (Binary Decision Chain)

1. "Error → Cause → Fix" structure? → **Troubleshooting**
2. "Why B instead of A?" with alternatives? → **Decision**
3. "What is X?" explanation? → **Concept**
4. Reusable implementation method? → **Pattern**
5. None → **Inbox**

## Current Implementation Status

- [x] Repo scaffolding
- [x] Librarian agent prototype
- [x] kc-promote skill prototype
- [ ] Seeker + Sentinel + Judge agents
- [ ] kc-seek skill
- [ ] kc-explore skill (kill feature)
- [ ] kc-connect skill (kill feature)
- [ ] init CLI script (npx kore-chamber init)
- [ ] Cleaner agent
- [ ] Librarian v2 (embeddings)
