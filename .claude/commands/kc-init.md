---
description: "Initialize your knowledge vault — profile synthesis + initial MOC generation + History to Chamber"
---

# /kc-init — Initialize Your Chamber

One-time setup after `npx kore-chamber init`. Synthesizes your profile and optionally builds initial vault from conversation history.

## Workflow

### 1. Read Init Answers

Read `~/.kore-chamber/init-answers.yaml` for:
- field, level, goal, learningStyle, deepInterest
- vaultPath
- historyOption (1=full scan, 2=recent, 3=skip)

Read `~/.kore-chamber/config.yaml` for vault_path.

### 2. Generate MY-PROFILE.md

Based on the init answers, generate `MY-PROFILE.md` at the vault root.

**Persona: Navigator** — calm, systematic, no unnecessary praise.

Structure:
```yaml
---
created: YYYY-MM-DD
tags: []
---
# MY-PROFILE

## 기본 정보
- 분야: [field]
- 수준: [level]
- 학습 스타일: [learningStyle]

## 목표
- [goal]

## 깊이 파고 싶은 영역
- [deepInterest]

## 선호/성향
(collect 파이프라인이 대화에서 자동 업데이트)

## 현재 집중 영역
(collect 파이프라인이 대화에서 자동 업데이트)
```

### 3. Ask Follow-up Questions

Refine the profile through 2-3 follow-up questions:
- "프론트엔드에서 React 외에 다른 프레임워크도 다루시나요?"
- "DB 설계에서 특히 관심 있는 쪽이 있나요?"

When the user signals done ("됐어", "enough"), finalize immediately.

Update MY-PROFILE.md with refined information.

### 4. Generate Initial MOCs

Based on the profile's fields and goals, create MOC files in `50-MOC/`:
- One MOC per major domain (e.g., `MOC-프론트엔드.md`, `MOC-백엔드.md`)
- Each MOC starts empty (just a header + description)

Update `AI-GUIDE.md`'s MOC Index table with the created MOCs.

### 5. History to Chamber (Optional)

If historyOption is 1 or 2:

1. Read `history_paths` from `~/.kore-chamber/config.yaml` (saved by `npx kore-chamber init`)
2. If `history_paths` is empty or missing, scan `~/.claude/projects/` for JSONL files as fallback
3. For each JSONL file, run: `kore-chamber collect --session <path> --output json`
4. This may take a while for large histories — show progress per file

If historyOption is 3: Skip.

### 6. Done

```
✅ 볼트 초기화 완료!
📄 MY-PROFILE.md 생성됨
🗂️ MOC [N]개 생성됨
[If history scanned: 📚 기존 대화에서 [N]개 노트 추출]

사용법:
- 평소처럼 AI와 대화하세요
- 대화 끝에 /kc-collect
- 뭘 모르겠으면 /kc-explore
```

## Language

Detect from init-answers.yaml (user's input language).
Respond in that language.
