---
description: "Harvest knowledge from the current conversation — scavenger → sentinel → librarian pipeline"
---

# /kc-collect — Harvest Your Conversation

Collect knowledge from the conversation you just had. Runs the full pipeline automatically.

## Workflow

### 1. Find Session Log

Find the current session's JSONL log:
1. List all `.jsonl` files in `~/.claude/projects/` recursively
2. The most recently modified `.jsonl` is the current session
3. Store this path — it will be passed to agents

### 2. Run Scavenger

Launch the `scavenger` agent with this prompt:

```
Analyze the session JSONL at: [jsonl_path]
Extract knowledge items and profile updates.
```

The scavenger will return:
- Knowledge items (each with title, category, tags, content, source context)
- Profile updates (each with dimension, current profile, observed change, evidence)

**If scavenger returns 0 items**: Display the summary and stop. No need to run sentinel/librarian.

### 3. Run Sentinel

Launch the `sentinel` agent with the knowledge items from scavenger (dedup only — no JSONL):

```
Check these knowledge items for duplicates against the vault and within the batch.

[paste scavenger's knowledge items output]
```

The sentinel will return:
- Passed items
- Rejected items with reasons (duplicates)

### 4. Run Librarian

Launch the `librarian` agent with:
- Sentinel-passed knowledge items
- Profile updates from scavenger (these bypass sentinel)

```
Process these items:

## Knowledge Items (Sentinel-approved)
[paste sentinel's passed items]

## Profile Updates (from Scavenger)
[paste scavenger's profile updates]
```

The librarian will:
- Classify, format, and save each knowledge item to the vault
- Apply profile updates to MY-PROFILE.md
- Discover and auto-link connections
- Check MOC sizes and split if needed

### 5. Display Results

After the pipeline completes, show a combined summary to the user:

```
━━━ Collect 완료 ━━━

📝 추출: [N]개 항목
✅ 저장: [N]개
  [list each stored note with folder and filename]
🔄 중복: [N]개 (센티넬이 중복 필터링)
❌ 탈락: [N]개
  [list each rejected item with reason]
🔗 연결: [N]개 자동 링크
👤 프로필: [N]개 업데이트
  [list each profile change]
━━━━━━━━━━━━━━━
```

## Error Handling

- If JSONL not found: Report error, suggest checking `~/.claude/projects/`
- If scavenger finds nothing: Display "대화가 너무 짧아 추출할 항목이 없습니다" and stop gracefully
- If sentinel rejects everything: Display rejections and stop — nothing reaches librarian
- If any agent fails: Report which agent failed and the error, do not continue the pipeline

## Language

Detect the user's language from `MY-PROFILE.md` in the vault.
Always respond in that language.
If unavailable, default to Korean.
