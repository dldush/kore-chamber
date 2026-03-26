---
description: "Promote a note from 90-Library/ to the main vault with type classification and MOC placement"
---

# /kc-promote — Promote Note to Main Vault

Promote a note from `90-Library/` to the appropriate main vault folder with proper classification, dedup checking, and MOC linking.

## Arguments

`$ARGUMENTS` — file path relative to vault root (e.g., `90-Library/react-server-components-caching.md`)

## Workflow

### 1. Resolve Vault Path

Read `~/.kore-chamber/config.yaml` to get the vault path.

### 2. Validate Input

If `$ARGUMENTS` is empty or invalid:
- List all `.md` files in `90-Library/` (excluding `_index.md`)
- Show them as a numbered list
- Ask the user to choose by number or filename

If the specified file does not exist:
- Report the error
- List available files in `90-Library/`

### 3. Analyze with Librarian

Launch the `librarian` agent to analyze the note. Pass the full absolute file path.

The librarian returns:
- **Dedup check**: Similar/duplicate notes found in the vault
- **Type classification**: Which folder type (Concept/Troubleshooting/Decision/Pattern/Inbox)
- **MOC placement**: Which MOC(s) to link from
- **Filename suggestion**: Vault naming convention compliant
- **Section coverage**: Which target sections the note already covers

### 4. Present Analysis to User

Display the librarian's full analysis report.

Then present a clear action summary:

```
━━━ 승격 계획 ━━━
📁 대상: [90-Library/source-file.md]
📂 분류: [Type] → [target-folder/]
📝 파일명: [suggested-filename.md]
🗂️ MOC: [MOC-name]
🔗 관련 노트: [linked notes]
⚠️ 주의: [merge/split warnings if any]
━━━━━━━━━━━━━━━
```

### 5. Get User Confirmation

Ask the user to confirm or modify:
- Classification (if they think the type is wrong)
- Merge vs create new (if duplicates were found)
- Filename
- MOC placement
- Split plan (if mixed content detected)

Proceed ONLY after explicit user approval.

### 6. Execute Promotion

On approval, perform these steps:

#### 6a. Restructure Content

Reformat the note to match the target folder's section template:

- **frontmatter**: Add `created: YYYY-MM-DD` and appropriate `tags: [domain]`
- **Title**: `# [Suggested filename without .md]`
- **Sections**: Reorganize content into the folder's expected section order
  - Concept: 핵심 → 동작 원리 → 실수하기 쉬운 점 → 관련 노트 → 플래시카드
  - Troubleshooting: 증상 → 원인 → 해결 → 관련 노트 → 플래시카드
  - Decision: 문제 → 대안 비교 → 결정 및 이유 → 관련 노트 → 플래시카드
  - Pattern: 언제 쓰는가 → 구현 → 트레이드오프 → 관련 노트 → 플래시카드
- **관련 노트**: Add `[[wiki-links]]` to related notes found in dedup
- **플래시카드**: Generate 2–3 flashcards in the vault's format:
  ```
  Q: [interview-style question about the concept]
  ?
  A: [2-3 sentence answer including "why"]
  ```

#### 6b. Write to Target Folder

Write the restructured note to `[target-folder]/[suggested-filename].md`.

#### 6c. Update MOC

Read the recommended MOC file. Add a `[[wiki-link]]` to the new note in the appropriate section. Maintain alphabetical or thematic ordering if the MOC has one.

#### 6d. Remove from 90-Library/

Delete the original file from `90-Library/`.

#### 6e. Update _index.md

If `90-Library/_index.md` contains a reference to the promoted file, remove that line.

#### 6f. Handle Merge (if applicable)

If the user chose MERGE instead of NEW:
- Read the existing target note
- Integrate new content into the existing note's structure
- Show the combined result to the user for approval before writing
- Do NOT delete the existing note — update it in place

### 7. Confirmation

After promotion, confirm:
```
✅ 승격 완료
📄 [target-folder/filename.md]
🗂️ [MOC-name]에 링크 추가됨
🗑️ 90-Library/[original-file.md] 삭제됨
```

## Language

Detect the user's language from `MY-PROFILE.md` in the vault.
Always respond in that language.
If unavailable, default to Korean.
