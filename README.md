# Kore Chamber

> Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

**A hybrid knowledge-vault engine for Claude Code**

### Give your AI your brain.

[한국어](README.ko.md)

> *"I know that I know nothing."* — Socrates

## Introduction

Kore Chamber stores Claude Code conversations into a Markdown knowledge vault.  
The key shift in Phase 1 is that it is no longer an AI-only prompt pipeline. It is now a **hybrid system where deterministic work is handled by a TypeScript core engine and AI is reserved for semantic judgment**.

### What changed

- **Code handles**: JSONL parsing, noise filtering, frontmatter IO, duplicate checks, file creation, MOC updates, related links, profile writes
- **AI handles**: knowledge extraction, category assistance, borderline dedup judgment, merge drafting, profile-change detection
- **Collection is explicit**: no automatic session-end harvesting by default

### Problems it solves

- You talk to AI a lot, but useful knowledge disappears after the session
- You pay context cost repeatedly because prior learning is hard to recover
- It is hard to see what you already know, what changed, and what is missing
- Raw notes are easy to create but hard to structure, connect, and reuse

### High-level flow

```text
[Claude Code conversation]
          ↓
[/kc-collect or kore-chamber collect]
          ↓
[TS Core] parse · dedup · write · link
          ↓
[AI] extract · classify assist · detect profile changes
          ↓
[Markdown Vault]
  - 10-Concepts
  - 20-Troubleshooting
  - 30-Decisions
  - 40-Patterns
  - 50-MOC
```

### One-line summary

If `CLAUDE.md` is a sticky note, Kore Chamber is a **structured personal knowledge graph**.

## Installation

### Requirements

- Node.js 18+
- Claude Code CLI

### 1. Initial setup

```bash
npx kore-chamber init
```

`init` does the following:

1. Checks that Claude Code CLI is installed
2. Verifies Claude OAuth login (opens browser if not logged in)
3. Creates the vault path and base folder structure
4. Asks about your field, level, goals, learning style, and deep interests
5. Collects existing Claude transcript paths and stores them in `config.yaml`
6. Installs Claude Code commands, skills, and agents
   - `~/.claude/commands/kc-init.md`
   - `~/.claude/commands/kc-explore.md`
   - `~/.claude/skills/kc-collect/`
   - `~/.claude/agents/*.md`
7. Adds your vault path to Claude Code settings
8. Inserts global vault reference rules into `~/.claude/CLAUDE.md`

### 2. Generate the initial profile

After installation, run this once inside Claude Code:

```text
/kc-init
```

This creates `MY-PROFILE.md` and your initial MOCs.

### 3. Verify the installation

```bash
kore-chamber doctor
```

### 4. Update

```bash
npx kore-chamber@latest update
```

`update` refreshes commands, skills, and agents without touching your vault or config.

## Usage

### Recommended flow

1. Talk in Claude Code as usual
2. When the conversation is worth keeping, run `/kc-collect`
3. Internally, it runs `kore-chamber collect --session ${CLAUDE_SESSION_ID}`
4. Review the summary of what was stored
5. Use `/kc-explore` when you want to inspect gaps

### Collect directly from the terminal

```bash
kore-chamber collect
```

Useful options:

```bash
kore-chamber collect --dry-run
kore-chamber collect --session <session-id>
kore-chamber collect --output json
```

- `--dry-run`: show the full storage plan without writing files
- `--session`: target a specific transcript
- `--output json`: machine-readable output for skills and automation

### Inspect health and vault state

```bash
kore-chamber doctor
kore-chamber status
```

- `doctor`: checks installation, missing files, Claude CLI, and vault structure
- `status`: shows note counts, MOC counts, orphan notes, broken links, and latest collection date

### Collection is intentionally manual

Kore Chamber does not collect automatically when a session ends.  
This is deliberate. The user should control when knowledge is persisted to avoid noisy or unwanted saves.

## Detailed Features

### Architecture

```text
src/
├── cli/
│   ├── index.ts
│   ├── init.ts
│   ├── update.ts
│   ├── collect.ts
│   ├── doctor.ts
│   └── status.ts
├── core/
│   ├── config.ts
│   ├── jsonl.ts
│   ├── vault.ts
│   ├── dedup.ts
│   ├── slug.ts
│   ├── moc.ts
│   └── linker.ts
├── llm/
│   ├── claude.ts
│   └── extract.ts
└── templates/
    └── AI-GUIDE.md
```

### `collect` pipeline

`kore-chamber collect` runs in this order:

1. Load `vault_path` from `config.yaml`
2. Resolve the transcript by session ID, or fall back to the latest JSONL
3. Parse JSONL and keep only user/assistant text
4. Remove tool output and system noise
5. Exit early if the conversation has fewer than 3 user turns
6. Read existing note summaries, tags, links, and `MY-PROFILE.md`
7. Ask the LLM for structured extraction
   - `knowledge_items[]`
   - `profile_updates[]`
8. Remove duplicates inside the extracted batch
9. Check each item against the vault
   - obvious duplicates are skipped by code
   - borderline cases are judged by AI as `new | merge | skip`
10. Generate a slug and store the note in the right folder
11. Merge into an existing note when needed
12. Add the note to the best-fit MOC
13. Add bidirectional related links
14. Add cross-links within the same collection batch
15. Apply profile updates by confidence
   - `high`: apply automatically
   - `medium`: keep pending for user confirmation
   - `low`: ignore
16. Print a human-readable summary or structured JSON

### Responsibility split between code and AI

| Area | Owner | Why |
|---|---|---|
| JSONL discovery/parsing | Code | deterministic work |
| Noise filtering | Code | rule-based |
| Frontmatter read/write | Code | consistency matters |
| First-pass dedup | Code | should be fast and reproducible |
| Borderline dedup judgment | AI | semantic interpretation needed |
| Merge drafting | AI-assisted, code-applied | natural synthesis needed |
| Slug generation | Code | consistent naming rules |
| MOC/link writes | Code | side-effectful operations |
| Knowledge extraction | AI | meaning-based |
| Profile-change detection | AI | context-sensitive |

### Vault structure

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

- `10-Concepts`: conceptual notes
- `20-Troubleshooting`: problem, cause, fix
- `30-Decisions`: trade-offs and decisions
- `40-Patterns`: reusable implementation patterns
- `50-MOC`: domain indexes

### MOC and linking strategy

- MOCs are topic/domain indexes, not note-type buckets
- Related links are found in 3 passes
  - 1st: 2+ overlapping tags or summary keyword match
  - 2nd: follow `## Related Notes` from 1st-degree notes
  - 3rd: notes in the same MOC
- Notes extracted from the same collection batch are linked together

### `doctor`

`doctor` checks:

- `~/.kore-chamber/config.yaml`
- `~/.kore-chamber/init-answers.yaml`
- vault path accessibility
- required vault folders
- `AI-GUIDE.md` and `MY-PROFILE.md`
- Claude Code commands and agents
- `claude` CLI availability

### `status`

`status` reports:

- note counts by folder
- total note count
- MOC count
- orphan notes not linked from any MOC
- broken wiki-links
- latest collection date

### Design principles

- **deterministic tasks belong to code**
- **ambiguous tasks belong to AI**
- **collection should be explicit**
- **Markdown remains the source of truth**
- **CLI should support both markdown and JSON output**

## License

MIT
