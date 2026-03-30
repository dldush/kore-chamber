# Kore Chamber

**The memory layer for Claude.**

[한국어](README.ko.md) · [Kore Protocol](PROTOCOL.md)

Kore Chamber connects to Claude Code via hooks. It injects your past knowledge at the start of every session, surfaces relevant notes as you type, and automatically collects new knowledge when a session ends.

- Input: Claude session JSONL (`~/.claude/projects/`)
- Output: Obsidian vault notes + MOC links
- Runtime: Node.js 18+

## Install

```bash
npx kore-chamber
```

On first run, Kore Chamber starts setup automatically:

1. Vault path — where to write notes (default: `~/Documents/KoreChamber`)
2. Profile — 5 questions about your field, level, and goals
3. Claude CLI + auth check
4. Vault structure + `MY-PROFILE.md` + `AI-GUIDE.md`
5. Claude hooks — registers SessionStart, UserPromptSubmit, SessionEnd
6. Bootstrap — optionally collects all past sessions right away

After setup, every subsequent run opens the command console directly.

> **Note:** Hook automation requires a stable executable path. If you plan to use hooks, install globally: `npm install -g kore-chamber`

## How It Works

Once hooks are installed, Kore Chamber runs in the background automatically:

```
Session starts
  → MY-PROFILE summary + recent notes injected into Claude context

You type a prompt
  → Relevant vault notes matched by semantic similarity and injected

Session ends
  → JSONL queued → background worker → collect → vault updated

Next session
  → New knowledge already in context
```

The vault grows with every session. The more you use Claude, the better the context gets.

### Init

When you run `kore-chamber` for the first time, it scans your existing Claude session history under `~/.claude/projects/` and bootstraps the vault from scratch. Every past conversation is parsed, filtered for noise, and passed to an LLM that extracts reusable knowledge — concepts, decisions, patterns, troubleshooting — and writes them as structured Obsidian notes. One command turns months of conversations into an organized knowledge base.

### Collect

Collect is the extraction engine. It reads a Claude session JSONL, filters noise, and sends the meaningful turns to an LLM that decides what's worth keeping. Before writing, it compares each candidate against existing notes using local semantic embeddings — `paraphrase-multilingual-MiniLM-L12-v2`, mean-pooled and L2-normalized, cosine similarity — and either creates a new note, merges into an existing one, or skips a duplicate. No external API is involved in deduplication; the model runs fully on-device (downloaded once, ~125 MB, cached at `~/.cache/huggingface/`). When hooks are installed, collect runs automatically in the background every time a session ends — you never have to trigger it manually.

### Injection

At the start of every session, Kore Chamber reads `MY-PROFILE.md` and scores your recent notes by freshness, confidence, and relevance to the current project directory. The top results are injected into Claude's context as `additionalContext` before the first message. When you submit a prompt, the same local embedding model computes semantic similarity between the prompt and every note in the vault — notes that match in meaning, not just in keywords, are attached. Claude always knows who you are and what you've already learned.

### Explore

> *"I know that I know nothing."* — Socrates

Knowing what you don't know is the beginning of real learning. `explore` analyzes your vault against your stated goals in `MY-PROFILE.md` and surfaces the gaps — the topics that are directly blocking your progress, the fundamentals you skipped, the areas you've avoided without realizing it.

This isn't a list of random suggestions. It's a gap map built from the delta between where you are and where you're trying to go. Use it when you feel like you're learning but not progressing, or when you want to set a direction for your next learning sprint.

## Commands

```bash
# One-shot
kore-chamber collect               # collect the latest unprocessed session
kore-chamber collect --all         # collect all unprocessed sessions
kore-chamber collect --dry-run     # preview without writing
kore-chamber status                # vault metrics
kore-chamber doctor                # system check (vault, auth, hooks)

# Profile
kore-chamber profile               # update MY-PROFILE.md
kore-chamber profile show          # print current profile
kore-chamber profile edit          # open in $EDITOR

# Automation
kore-chamber hooks install         # register Claude hooks manually
kore-chamber queue show            # inspect the automation queue
kore-chamber queue worker          # process pending queue entries

# Context (used internally by hooks)
kore-chamber context session       # SessionStart context
kore-chamber context prompt        # UserPromptSubmit context

# Other
kore-chamber init                  # re-run setup
kore-chamber doctor                # diagnose installation
kore-chamber mcp                   # run MCP server manually
```

## Vault Structure

```
vault/
├── AI-GUIDE.md          ← instructions for Claude
├── MY-PROFILE.md        ← your field, level, goals
├── 00-Inbox/
├── 10-Concepts/
├── 20-Troubleshooting/
├── 30-Decisions/
├── 40-Patterns/
└── 50-MOC/
```

Processed sessions are tracked in `~/.kore-chamber/processed.yaml`. Re-running `collect` only picks up new sessions.
