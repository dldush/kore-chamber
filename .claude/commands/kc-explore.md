---
description: "Show what you don't know — vault gap analysis and learning direction"
---

# /kc-explore — What Don't You Know?

> *"I know that I know nothing."* — Socrates

## Arguments

`$ARGUMENTS` — optional focus topic (e.g., "프론트엔드 면접", "React 성능")

- If provided: narrow analysis to that area only
- If empty: analyze all domains

## Workflow

### 1. Run Explorer

Launch the `explorer` agent with the focus topic (if any):

If $ARGUMENTS is not empty:
```
Focus topic: $ARGUMENTS
Analyze this area only.
```

If $ARGUMENTS is empty:
```
No focus topic. Analyze all domains.
```

### 2. Display Results

The explorer returns: domain coverage + 3-5 specific gap recommendations. Display as-is.

### 3. Next Step Prompt

```
이 중 하나를 골라서 AI와 대화를 시작하면, collect가 자동으로 수확합니다.
번호를 선택하거나, 다른 주제를 직접 말씀하세요.
```

If the user picks a topic, start a conversation about it. When done, remind them to `/kc-collect`.

## Language

Detect from `MY-PROFILE.md`. Default Korean.
