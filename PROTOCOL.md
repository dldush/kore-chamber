# Kore Protocol v1

A specification for AI-readable personal knowledge vaults.

## 1. Overview

Kore Protocol defines a standard structure for organizing personal knowledge in a way that both humans and AI assistants can read, search, and maintain. It is file-based (Markdown + YAML frontmatter), tool-agnostic, and designed for long-term knowledge accumulation.

**Design principles:**
- Human-readable first, machine-parseable second
- Files are the source of truth (no database required)
- Knowledge has a lifecycle (creation → reinforcement → decay)
- Structure enables automated retrieval without requiring embeddings

## 2. Vault Structure

```
vault/
├── AI-GUIDE.md              # Vault navigation rules for AI agents
├── MY-PROFILE.md            # User profile (goals, skills, preferences)
├── 00-Inbox/                # Unclassified notes (staging area)
├── 10-Concepts/             # "What is X?" — definitions, principles
├── 20-Troubleshooting/      # "Error → Cause → Fix" — debug records
├── 30-Decisions/            # "Why B instead of A?" — design choices
├── 40-Patterns/             # Reusable implementation methods
├── 50-MOC/                  # Maps of Content (domain index files)
└── Templates/               # Note scaffolding (read-only)
```

Folders `10-40` are **knowledge folders** — they contain typed notes with frontmatter.
Folder `50-MOC` contains index files that link to knowledge notes.
Folder `00-Inbox` is a staging area for notes not yet classified.

Additional personal folders (e.g., `60-Thinking/`, `70-Career/`, `80-CodingTest/`) are outside the core protocol and tool-specific.

## 3. Frontmatter Schema

All knowledge notes (`00-40`) use YAML frontmatter:

```yaml
---
created: YYYY-MM-DD            # REQUIRED — creation date
tags: [tag1, tag2]             # REQUIRED — domain tags (can be empty [])
type: concept                  # RECOMMENDED — note type (see §4)
summary: "One-line summary"    # RECOMMENDED — used for search and MOC display
confidence: 0.5                # OPTIONAL — 0.0-1.0, reinforcement score
last_referenced: YYYY-MM-DD   # OPTIONAL — last time an AI agent read this note
---
```

### Field definitions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `created` | `string` (YYYY-MM-DD) | Yes | — | Note creation date |
| `tags` | `string[]` | Yes | `[]` | Lowercase domain tags, no spaces |
| `type` | `string` | Recommended | inferred from folder | One of: `concept`, `troubleshooting`, `decision`, `pattern` |
| `summary` | `string` | Recommended | — | One-line description for search ranking |
| `confidence` | `number` | Optional | `0.5` | Reinforcement score. Increases on merge (+0.1), capped at 1.0 |
| `last_referenced` | `string` (YYYY-MM-DD) | Optional | `created` | Updated when an AI agent reads the note |

### MOC frontmatter (minimal)

```yaml
---
created: YYYY-MM-DD
tags: [moc]
---
```

## 4. Note Types & Section Templates

Each note type has a required section order:

### Concept (`10-Concepts/`)

```markdown
# {Title}
## 핵심              — Core definition (1-2 sentences)
## 동작 원리          — How it works (detailed, with code examples)
## 실수하기 쉬운 점   — Common pitfalls
## 관련 노트          — Wiki-links to existing notes
## 플래시카드         — Spaced repetition cards (Q ? A format)
```

### Troubleshooting (`20-Troubleshooting/`)

```markdown
# {Title}
## 증상      — Observable symptoms / error messages
## 원인      — Root cause analysis
## 해결      — Solution with code examples
## 관련 노트
## 플래시카드
```

### Decision (`30-Decisions/`)

```markdown
# {Title}
## 문제          — Problem statement / context
## 대안 비교      — Table comparing alternatives (pros/cons)
## 결정 및 이유   — Final choice + rationale + implementation
## 관련 노트
## 플래시카드
```

### Pattern (`40-Patterns/`)

```markdown
# {Title}
## 언제 쓰는가    — Use cases and context
## 구현           — Implementation details with code
## 트레이드오프    — Pros vs cons
## 관련 노트
## 플래시카드
```

### Section rules

- Section headers are `##` (h2). `#` (h1) is reserved for the note title.
- `## 관련 노트` contains only `[[wiki-links]]` to **existing** notes.
- `## 플래시카드` uses Obsidian Spaced Repetition format: `Q: ... ? A: ...`
- Section names are in the vault's primary language (configurable).

## 5. MOC (Map of Contents)

MOC files are domain indexes stored in `50-MOC/`:

```markdown
---
created: 2026-03-01
tags: [moc]
---
# MOC — {Domain Name}

## 개념
- [[concept-note-1]]
- [[concept-note-2]]

## 설계 결정
- [[decision-note-1]]

## 패턴
- [[pattern-note-1]]

## 트러블슈팅
- [[debug-note-1]]
```

### Rules

- One MOC per major domain/topic.
- Links are grouped by knowledge type.
- Links are wiki-links only — no inline descriptions.
- MOC split threshold: 30 links. Beyond this, consider sub-MOCs.
- Filename format: `MOC-{domain}.md`

## 6. Filename Convention

- **Primary language**: Vault language (Korean, English, etc.)
- **Separator**: Hyphens only (`-`). No underscores, spaces, or dots.
- **Abbreviations**: Domain-standard English acronyms stay as-is (`API`, `JWT`, `DB`)
- **No type suffix**: Folder determines type, not filename.
- **Length**: 3-5 words preferred.
- **MOC prefix**: `MOC-` for all MOC files.

Examples:
```
서로게이트-키와-비즈니스-키.md       # Korean primary
JWT-토큰-저장과-보안.md             # Mixed Korean + English acronym
NextJs-localStorage-hydration.md    # English technical term
MOC-데이터베이스.md                 # MOC file
```

## 7. Tag System

- All lowercase, no spaces.
- Domain-centric: `database`, `frontend`, `backend`, `react`, `typescript`, etc.
- Special tag: `moc` (MOC files only).
- Tags are independent of folder type.
- No tag hierarchy — flat namespace.

## 8. Link Format

- Internal links: `[[note-slug]]` (wiki-link format)
- Slug = filename without `.md`
- Links must point to existing notes only.
- Bidirectional linking: when note A links to note B, note B should link back.

## 9. Profile Schema (MY-PROFILE.md)

The profile file describes the vault owner for AI personalization:

```markdown
# MY-PROFILE

## 역할
(Current role, experience level, company)

## 목표
(Short-term and long-term goals)

## 현재 집중 영역
(Technologies and domains currently learning/working on)

## 선호/성향
(Communication style, learning preferences)

## 기술 스택
(Known technologies and proficiency levels)
```

No frontmatter required. Section names are in the vault's primary language.

## 10. Search Protocol — Spreading Activation

When an AI agent needs to find relevant knowledge:

**1st Activation (Direct Match)** — weight: 1.0
- Search note summaries by keyword similarity (Jaccard or semantic)
- Match notes with >= 2 tag overlap

**2nd Activation (Link Traversal)** — weight: 0.5
- Follow `## 관련 노트` links from 1st-degree matches

**3rd Activation (MOC Neighbors)** — weight: 0.3
- Find notes in the same MOC as matched notes

**Ranking**: `score = similarity * (0.7 + 0.3 * confidence)`

Read full note body only when needed — prefer summary-based filtering.

## 11. Retrieval API (MCP Tools)

Kore Protocol defines a standard tool interface for AI agents:

| Tool | Input | Output | Side Effect |
|------|-------|--------|-------------|
| `kc_search` | `query: string, limit?: number` | Ranked note summaries with similarity scores | None |
| `kc_read` | `slug: string` | Full note (frontmatter + body) | Updates `last_referenced` |
| `kc_profile` | — | MY-PROFILE.md content | None |
| `kc_related` | `slug: string` | Related notes via Spreading Activation | None |
| `kc_status` | — | Vault statistics (counts, freshness, confidence) | None |
| `kc_moc_list` | — | All MOC files with link counts | None |
| `kc_moc_read` | `name: string` | MOC contents with note summaries | None |

## 12. Knowledge Lifecycle

Notes have a lifecycle tracked by `confidence` and `last_referenced`:

### Confidence (reinforcement)

```
New note created          → confidence = 0.5
Merged with new knowledge → confidence += 0.1 (max 1.0)
Search ranking            → weighted by confidence
```

### Freshness (calculated, not stored)

```
last_referenced within 30 days  → "current"
last_referenced within 90 days  → "aging"
last_referenced over 90 days    → "stale"
```

Default reference date: `created` (if `last_referenced` is absent).

### Lifecycle flow

```
Created (0.5) → Referenced → Reinforced (0.6+) → Frequently used (0.8+)
                                                         or
Created (0.5) → Never referenced → Aging → Stale → Archive candidate
```

Stale notes are not automatically deleted — they are flagged for manual review.

---

## Appendix: Type Classification (Decision Chain)

When classifying a knowledge item:

1. "Error → Cause → Fix" structure? → **Troubleshooting**
2. "Why B instead of A?" with alternatives? → **Decision**
3. "What is X?" explanation? → **Concept**
4. Reusable implementation method? → **Pattern**
5. None of the above → **Inbox**
