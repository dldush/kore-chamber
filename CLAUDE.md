# Kore-Chamber — Project Rules

## Overview

AI-powered knowledge chamber for Obsidian vaults. Multi-agent system built on Claude Code skills + agents.

- **Runtime**: TypeScript core engine + Claude Code skills/agents
- **CLI**: `kore-chamber` (init, collect, doctor, status, update)
- **Skills**: `.claude/skills/kc-collect/` + `.claude/commands/` (kc-init, kc-explore)
- **Agents**: `.claude/agents/` (explorer, librarian, scavenger, sentinel)
- **Config**: `~/.kore-chamber/config.yaml` (vault path)
- **Auth**: Claude OAuth (계정 기반, `claude login`)

## Architecture: Hybrid TS + AI

```
User-facing                     Internal
──────────────────────          ─────────────────────
/kc-collect (or CLI)         → TS engine: parse · dedup · write · link
                                → AI: extract · classify · merge · profile
/kc-explore                  → explorer agent: MOC scan → gap analysis
/kc-init                     → AI: profile synthesis + initial MOCs
npx kore-chamber init        → CLI: vault scaffold + Claude auth + install
```

- **Code handles**: JSONL parsing, noise filtering, frontmatter IO, dedup, file creation, MOC updates, linking
- **AI handles**: knowledge extraction, borderline dedup, merge drafting, profile-change detection

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

## JSONL Data Source

The TS engine reads session JSONL logs from `~/.claude/projects/<project>/<session>.jsonl`.
Context compression does not affect the log — full conversation is preserved.

## Type Classification (Binary Decision Chain)

1. "Error → Cause → Fix" structure? → **Troubleshooting**
2. "Why B instead of A?" with alternatives? → **Decision**
3. "What is X?" explanation? → **Concept**
4. Reusable implementation method? → **Pattern**
5. None → **Inbox**

## Current Implementation Status

### Core Engine (Phase 1 — complete)
- [x] Repo scaffolding
- [x] TS core engine (JSONL parsing, dedup, vault IO, linking, MOC, slug)
- [x] LLM integration (CLI first, Agent SDK fallback)
- [x] Claude OAuth auth (init + runtime re-auth fallback)
- [x] CLI: init, collect, doctor, status, update

### Skills & Agents
- [x] kc-collect skill (TS engine wrapper, `--output json`)
- [x] kc-init command spec
- [x] kc-explore command spec
- [x] Agent specs: explorer, librarian, scavenger, sentinel

### Pending
- [ ] kc-explore end-to-end verification
- [ ] kc-init end-to-end verification
- [ ] Real collect test (non-dry-run)
- [ ] npm publish v0.3.0
