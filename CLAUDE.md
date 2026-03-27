# Kore-Chamber — Project Rules

## Overview

AI-powered knowledge chamber for Obsidian vaults. Multi-agent system built on Claude Code skills + agents.

- **Runtime**: Claude Code (no separate backend)
- **Agent definitions**: `.claude/commands/` (skills) + `.claude/agents/` (subagents)
- **Config**: `~/.kore-chamber/config.yaml` (vault path)
- **Design doc**: Obsidian `70-Career/Projects/Kore-Chamber.md`

## Architecture: 2-Skill System

```
Skills (user-facing)              Agents (auto pipeline)
──────────────────────            ─────────────────────
/kc-explore (session start)    → librarian (promote candidates) + LLM (gap analysis)
/kc-collect (session end)      → scavenger → sentinel → judge → librarian → connect
```

- **explore**: Vault briefing + promote candidates + gap analysis
- **collect**: Harvest conversation context → auto pipeline → 90-Library/

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
└── Templates/
```

> No 90-Library/ staging area. Agents save directly to main vault folders (10-40).
> Personal folders (60-Thinking, 70-Career, etc.) are NOT part of the standard structure.

## Scavenger Data Source

Scavenger reads the session JSONL log (`~/.claude/projects/<project>/<session>.jsonl`).
Context compression does not affect the log — full conversation is preserved.

## Type Classification (Binary Decision Chain)

1. "Error → Cause → Fix" structure? → **Troubleshooting**
2. "Why B instead of A?" with alternatives? → **Decision**
3. "What is X?" explanation? → **Concept**
4. Reusable implementation method? → **Pattern**
5. None → **Inbox**

## Current Implementation Status

- [x] Repo scaffolding
- [x] Librarian agent prototype
- [x] kc-promote skill prototype (to be absorbed into explore)
- [ ] Scavenger + Sentinel + Judge agents
- [ ] kc-collect skill
- [ ] kc-explore skill
- [ ] init CLI script (npx kore-chamber init)
- [ ] Librarian v2 (embeddings)
