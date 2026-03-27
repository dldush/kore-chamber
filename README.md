# Kore Chamber

> Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

**All this project does is install a set of agents and skills into your Claude Code. That's it.**

### Give your AI your brain.

[한국어](README.ko.md)

> *"I know that I know nothing."* — Socrates

Your AI meets you for the first time, every time. It doesn't know what you learned yesterday, what level you're at, or where you're headed. Kore-Chamber breaks this limit.

## Get Started

```bash
npx kore-chamber init
```

Or just tell your AI: **"Install kore-chamber for me"** and paste this link:
```
https://raw.githubusercontent.com/dldush/kore-chamber/main/docs/guide/installation.md
```

## Why Use It

- **Your AI remembers you.** Across sessions, your AI knows your level, goals, and preferences. No more "I'm a frontend developer and..." every conversation.
- **Knowledge accumulates automatically.** Just talk to AI. Collect handles classification, connection, and storage. You just learn.
- **You can see what you don't know.** Explore shows gaps in your knowledge relative to your goals. "What should I study next?" disappears.
- **It compounds over time.** As your vault grows, AI personalization deepens, connections multiply, and gap analysis sharpens. N notes = N×(N-1)/2 possible connections — compound growth.

## Who Is This For

- You talk to AI a lot, but **learned things vanish**
- You learn BFS-style (broad and shallow) and **lose track of where you are**
- You're tired of AI **not knowing anything about you**
- You've had the **"I don't know what I don't know"** moment

## How It Works

**Use AI as you normally do.** Just `collect` when you're done.

```
[Normal] Free conversation with AI — learning, coding, debugging, anything
                              ↓
[When done] /kc-collect → Knowledge auto-saved to your vault
                              ↓
                    As vault grows, AI understands you deeper
                              ↓
[When stuck] /kc-explore → "Here's what you don't know" (WIP — being refined)
```

- **collect**: Auto-extracts concepts, troubleshooting, decisions, patterns + profile updates → verifies → classifies → stores → connects
- **explore** (WIP): Shows gaps between your goals and your vault. Turns unknown unknowns into known unknowns

## Beyond CLAUDE.md

Claude Code's `CLAUDE.md` and `MEMORY.md` are a great start, but they have limits.

| | CLAUDE.md / MEMORY.md | Kore-Chamber |
|---|---|---|
| **Storage** | Memory files, 200-line limit | Physical Markdown files, **no size limit** |
| **Structure** | Flat text | MOCs + wiki-links + frontmatter = **structured knowledge graph** |
| **Search** | Read entire file | Spreading Activation = **retrieve only relevant knowledge** |
| **Scope** | Per-project | **Global** — access your full knowledge from any project |
| **Organization** | Manual | Agents **auto-classify + auto-connect** |

If CLAUDE.md is a sticky note, Kore-Chamber is **an actual brain**.

## What Makes It Different

| Before | With Kore-Chamber |
|--------|-------------------|
| AI meets you fresh every time | Vault gives AI **your level, goals, and knowledge** |
| Learned things vanish after the session | Collect **auto-harvests, classifies, connects** |
| Don't know what you don't know | Explore **shows the gaps** |
| Note organization is your job | AI handles **everything automatically** |

## Agent System

### Collect Pipeline: `scavenger → sentinel → librarian`

#### Scavenger — Harvester

Reads the session JSONL log after conversation ends. Extracts knowledge and profile changes.

**Two extraction tracks:**
- **Track 1 (Knowledge)**: Concepts, troubleshooting, decisions, patterns → through Sentinel to vault
- **Track 2 (Profile)**: Level changes, new goals, preferences → auto-update MY-PROFILE.md

**Methodologies:**

| Method | Field | Application |
|--------|-------|-------------|
| Content Analysis | Qualitative Research | **Manifest** (explicitly stated) + **Latent** (inferred from conversation patterns) |
| User Modeling | HCI/UX | **Knowledge** × **Goal** × **Preference** — 3-axis user modeling |
| Bloom's Taxonomy | Education | 6-level comprehension assessment (Remember → Understand → Apply → Analyze → Evaluate → Create) |
| Schema Theory | Cognitive Psychology | Profile updates via **Assimilation** (fits existing → append) / **Accommodation** (conflicts → replace) |

#### Sentinel — Dedup Filter

Fast duplicate check only. No JSONL re-parsing, no supplementation. Speed over thoroughness.

**Rubric (2 criteria):**
- **Novelty (vault)** — Semantic comparison with existing note summaries (frontmatter only)
- **Novelty (batch)** — Dedup within the current extraction batch

**Methodologies:**

| Method | Field | Application |
|--------|-------|-------------|
| Fuzzy Matching | Information Retrieval | **Semantic similarity** with existing note `summary` fields — frontmatter only for speed |

> JSONL cross-validation, accuracy checks, and supplementation removed. Dedup-focused for pipeline speed.

#### Librarian — Placement + Storage + Connection

Stores Sentinel-approved items directly in the main vault and applies profile updates.

**7-step process:**
1. Type classification (with confidence check)
2. Filename + semantic duplicate detection
3. New note or Evergreen merge into existing
4. Save to main vault
5. MOC link + topic-based auto-split
6. Cross-type / cross-domain connection via Spreading Activation
7. Hebbian co-occurrence linking for batch items

**Methodologies:**

| Method | Field | Application |
|--------|-------|-------------|
| Faceted Classification | Library Science | Type (primary) + domain + abstraction level (secondary) — **multi-facet classification** |
| Evergreen Notes | Andy Matuschak | Merge into **existing notes with overlapping summaries** — grow notes, don't duplicate |
| Spreading Activation | Cognitive Psychology | Brain-like **activation spread** through connections — 1st (direct) → 2nd (linked) → 3rd (same MOC) |
| Hebbian Learning | Neuroscience | "Neurons that fire together wire together" — items from the **same conversation auto-link** |
| Topic Modeling | NLP | MOC split via **summary clustering**, not just link count |

**Profile updates**: Schema Theory-based Assimilation/Accommodation on MY-PROFILE.md

### Explore: `explorer`

#### Explorer — Gap Analyst

Shows what you don't know. Fast — reads MOC files only, no individual note scanning.

**2-step analysis:**
1. **Quick Scan** — Read MOC files only → domain coverage at a glance
2. **Gap Inference** — LLM domain knowledge + MY-PROFILE goals + MOC scan → 3-5 specific gaps

> No dependency trees, no topology analysis, no note sampling. MOCs → goals → gaps → recommendations. Speed over exhaustiveness.

## What Happens During Init

1. Set vault path
2. Answer 5 questions (field, level, goals, learning style, deep interests)
3. Scan existing Claude conversation logs to auto-build initial vault (History to Chamber)
4. Install skills + agents + vault navigation rules into Claude Code
5. Insert vault reference rules into global CLAUDE.md — AI knows you in every session

## Vault Navigation: Spreading Activation

Instead of static paths (AI-GUIDE → MOC → note), navigation follows the **brain's spreading activation** model.

```
Start: User asks about "JWT"
    ↓
1st activation (strong): Notes with summaries directly related to JWT
    → [[httpOnly-Cookie-Auth]], [[Token-Refresh-Strategy]]
    ↓
2nd activation (medium): Follow linked notes' ## Related Notes
    → [[XSS-Defense]], [[CORS-Config]]
    ↓
3rd activation (weak): Other notes in the same MOC
    → Remaining notes in MOC-Security
    ↓
Below threshold: Not activated
```

| Principle | Source | Application |
|-----------|--------|-------------|
| Spreading Activation | Collins & Loftus, 1975 | Activation spreads through connections, decaying with distance |
| Hebbian Learning | Hebb, 1949 | Items extracted from the same conversation auto-link to each other |

## Obsidian Recommended

Kore-Chamber runs on plain Markdown files. You could open them in Notepad.

**But seriously, use Obsidian.** The connections built by Spreading Activation come alive in the graph view. You can watch your brain grow. Once you hit 100 notes, you'll just stare at the graph view. That's your brain.

## Tech Stack

- **Agent Runtime**: Claude Code (Skills + Agent Teams)
- **Knowledge Store**: Markdown (Obsidian strongly recommended)
- **Init CLI**: TypeScript (npm)
- **Navigation**: Spreading Activation (no extra infra — wiki-links + tags + MOCs)

## License

MIT
