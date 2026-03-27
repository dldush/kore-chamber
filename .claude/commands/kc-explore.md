---
description: "Show what you don't know — vault gap analysis and learning direction"
---

# /kc-explore — What Don't You Know?

> *"I know that I know nothing."* — Socrates

Analyze your vault against your goals and show what's missing.

## Workflow

### 1. Run Explorer

Launch the `explorer` agent. No additional input needed — the explorer reads MY-PROFILE.md and AI-GUIDE.md directly.

```
Perform a full vault analysis and gap report.
```

### 2. Display Results

The explorer returns a structured report. Display it to the user as-is — the explorer's output format is already user-facing.

The report includes:
- Vault Intelligence (domain coverage, activation topology, type distribution)
- Competency Map (dependency tree with covered/missing nodes)
- Gap Analysis (goal-based, depth, connection gaps)
- Learning Direction (3-5 prioritized recommendations with ZPD reasoning)
- Goal alignment observations (if any)

### 3. Next Step Prompt

After displaying the report, prompt the user:

```
이 중 하나를 골라서 AI와 대화를 시작하면, collect가 자동으로 수확합니다.
번호를 선택하거나, 다른 주제를 직접 말씀하세요.
```

If the user picks a topic, start a natural conversation about that topic. When the conversation ends, remind them to use `/kc-collect`.

## Language

Detect the user's language from `MY-PROFILE.md` in the vault.
Always respond in that language.
If unavailable, default to Korean.
