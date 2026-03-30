# Kore Chamber

Turn Claude conversation logs into structured Obsidian notes.

[한국어](README.ko.md) · [Kore Protocol](PROTOCOL.md)

## What It Is

Kore Chamber is a standalone CLI that reads Claude JSONL sessions from `~/.claude/projects/`, extracts reusable knowledge with an LLM, removes duplicates, and writes the result into an Obsidian vault.

- Input: Claude session JSONL
- Output: Obsidian markdown notes + MOC links
- Runtime: Node.js 18+
- Auth: `claude` CLI login for extraction
- Optional: `kore-chamber mcp` to expose the vault through MCP manually

## Install

```bash
npx kore-chamber init
```

`init` does the following:

1. Checks that the `claude` CLI is installed
2. Verifies Claude authentication
3. Creates the vault structure
4. Asks 5 profile questions
5. Creates `MY-PROFILE.md`
6. Saves `~/.kore-chamber/config.yaml`

## Usage

```bash
kore-chamber collect
kore-chamber collect --all
kore-chamber collect --session <session-id>
kore-chamber collect --dry-run

kore-chamber profile
kore-chamber profile edit

kore-chamber status
kore-chamber doctor
kore-chamber mcp
```

- `collect`: collect the most recent unprocessed session
- `collect --all`: collect every unprocessed session
- `collect --session`: collect a specific session and ignore tracker filtering
- `collect --dry-run`: preview without writing notes or tracker state
- `profile`: print `MY-PROFILE.md`
- `profile edit`: open `MY-PROFILE.md` in `$EDITOR`
- `mcp`: run the MCP server manually if you want the vault exposed as tools

`kore-chamber explore` is reserved for a later version and currently returns a placeholder message.

## How It Works

```text
Claude JSONL
    ↓
JSONL parse + noise filter
    ↓
LLM extraction
    ↓
dedup + merge judgment
    ↓
Obsidian note write
    ↓
MOC + related link update
```

Knowledge is classified into:

- `10-Concepts`
- `20-Troubleshooting`
- `30-Decisions`
- `40-Patterns`
- `50-MOC`

Processed sessions are tracked in `~/.kore-chamber/processed.yaml`, so repeated `collect` runs only pick up unprocessed sessions by default.
