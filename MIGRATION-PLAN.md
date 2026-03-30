# Kore-Chamber v2.0 Migration Plan

## 1. Direction Change

```
Before: Claude Code에 편입되는 AI knowledge chamber (skills + agents + MCP)
After:  독립 CLI 도구 — AI 대화를 체계적으로 분류해서 Obsidian 노트로 저장

핵심 변경:
- Claude Code skills/agents/commands 제거
- 별도 CLI 프로젝트로 독립
- 입력: Claude Code JSONL (MVP), 추후 다른 AI 포맷 확장 가능
- 출력: 범용 Obsidian 노트 (어떤 AI에서든 참고 가능)
```

---

## 2. Architecture

### Before
```
사용자 → Claude Code → /kc-collect 스킬 → TS 엔진 + AI 에이전트
                      → /kc-init 커맨드 → 프로필 합성
                      → /kc-explore 커맨드 → 갭 분석
                      → MCP 서버 (자동 등록)
```

### After
```
사용자 → 터미널 → kore-chamber collect → TS 엔진 (JSONL 파싱 + LLM 추출 + 볼트 저장)
                 → kore-chamber explore → LLM 기반 갭 분석
                 → kore-chamber profile → MY-PROFILE.md 보기/편집
                 → kore-chamber mcp     → MCP 서버 (선택적, 수동 설정)
```

---

## 3. CLI Commands

### Before → After

| Before | After | 변경 내용 |
|--------|-------|----------|
| `init` | `init` | Claude Code 연동 제거, 초기 볼트 구성 통합 |
| `collect` | `collect` | profile update 제거, `--all` 배치 모드 추가, 세션 추적 |
| `update` | 삭제 | skills/agents 업데이트 목적이었으므로 불필요 |
| `doctor` | `doctor` | Claude Code 관련 진단 제거 |
| `status` | `status` | 유지 |
| `mcp` | `mcp` | 유지 (선택적) |
| — | `profile` | 신규: MY-PROFILE.md 보기/편집 |
| — | `explore` | 신규 (V2): 볼트 갭 분석 |

### After CLI Usage
```
kore-chamber init                    초기 설치 (볼트 생성 + 인증 + 선택적 초기 수집)
kore-chamber collect                 최근 미처리 세션 1개 수집
kore-chamber collect --all           미처리 세션 전부 수집
kore-chamber collect --session <id>  특정 세션 수집
kore-chamber collect --dry-run       실제 저장 없이 미리보기
kore-chamber profile                 MY-PROFILE.md 보기
kore-chamber profile edit            $EDITOR로 MY-PROFILE.md 편집
kore-chamber status                  볼트 통계
kore-chamber doctor                  설치 상태 진단
kore-chamber mcp                     MCP 서버 실행 (선택적)
```

---

## 4. File Changes

### 4.1 Keep As-Is (변경 없음)

| File | 이유 |
|------|------|
| `src/core/vault.ts` | 노트 I/O, frontmatter — 핵심 기능 그대로 |
| `src/core/moc.ts` | MOC 관리 — 변경 불필요 |
| `src/core/dedup.ts` | 중복 체크 — 변경 불필요 |
| `src/core/linker.ts` | 관련 노트 탐색 — 변경 불필요 |
| `src/core/slug.ts` | 파일명 생성 — 변경 불필요 |
| `src/core/config.ts` | 설정 로드 — 변경 불필요 |
| `src/core/migrate.ts` | config 마이그레이션 — 변경 불필요 |
| `src/core/platform.ts` | OS 감지 — 변경 불필요 |
| `src/llm/claude.ts` | Claude API 연동 — 변경 불필요 |
| `src/mcp/server.ts` | MCP 서버 — 변경 불필요 |
| `src/mcp/tools.ts` | MCP 도구 정의 — 변경 불필요 |
| `src/templates/AI-GUIDE.md` | 볼트 구조 설명 템플릿 — 변경 불필요 |
| `PROTOCOL.md` | Kore Protocol 스펙 — 변경 불필요 |
| `tsconfig.json` | TS 설정 — 변경 불필요 |

### 4.2 Modify (수정)

#### `src/cli/index.ts`
- `update` 케이스 제거
- `profile` 케이스 추가 → `./profile.js` import
- `explore` 케이스 추가 (V2 표시, 미구현 안내)
- help 텍스트 갱신 (Claude Code 언급 제거)

#### `src/cli/collect.ts`
**profile update 관련 코드 제거:**
- `ProfileApplied`, `ProfilePending`, `PlannedProfileUpdate` 인터페이스 삭제
- `CollectOutput`에서 `profileUpdatesApplied`, `profileUpdatesPending` 필드 제거
- `collect()` 함수에서 `readProfile()` 호출 제거 (프로필은 추출 프롬프트에 전달하지 않음)
- `collect()` 함수에서 `extraction.profile_updates` 처리 블록 제거 (L230-237)
- `executePlan()`에서 `profileUpdates` 파라미터 제거, `updateProfileSection()` 호출 제거 (L423-428)
- `buildOutput()`에서 profile 관련 출력 제거
- `printPlan()`에서 프로필 업데이트 표시 제거 (L341-352)
- `dimensionToSection()` 헬퍼 삭제

**`--all` 배치 모드 추가:**
- `parseArgs()`에 `--all` 플래그 추가 → `allUnprocessed: boolean`
- `--all` 모드: `findAllJsonl()` 호출 → tracker에서 미처리 세션 필터 → 각각 collect 파이프라인 실행
- 기본 모드: `findLatestUnprocessed()` → 미처리 중 가장 최근 1개만 처리

**세션 추적 연동:**
- collect 완료 후 `tracker.markProcessed(sessionId, notesCreated)` 호출

**진행 표시 (배치 모드):**
```
📥 미처리 세션 12개 발견
   LLM API 토큰이 사용됩니다.
   [████████░░░░░░░░░░░░] 4/12 처리 중... (~3분 남음)
```

**기존 import 정리:**
- `readProfile`, `updateProfileSection` import 제거
- `tracker` import 추가

#### `src/llm/extract.ts`
**`ProfileUpdate` 타입 및 관련 코드 제거:**
- `ProfileUpdate` interface 삭제
- `ExtractionResult`에서 `profile_updates` 필드 제거
- `EXTRACTION_SCHEMA`에서 `profile_updates` 프로퍼티 제거
- `buildPrompt()`에서:
  - `profile` 파라미터 제거
  - `## User Profile` 섹션 제거
  - `## Dedup Hint` 섹션은 유지
- `extractKnowledge()`:
  - 시그니처에서 `profile` 파라미터 제거
  - 반환값에서 `profile_updates` 제거
  - 검증 로직에서 `profile_updates` 제거

**결과 타입:**
```typescript
// Before
export interface ExtractionResult {
  knowledge_items: KnowledgeItem[];
  profile_updates: ProfileUpdate[];
}

// After
export interface ExtractionResult {
  knowledge_items: KnowledgeItem[];
}
```

#### `src/core/jsonl.ts`
**`findAllJsonl()` 함수 추가:**
```typescript
export interface JsonlFileInfo {
  path: string;
  sessionId: string;
  mtime: number;
  projectPath: string; // 어떤 프로젝트의 세션인지
}

export function findAllJsonl(): JsonlFileInfo[] {
  // ~/.claude/projects/ 아래 모든 JSONL 파일 탐색
  // subagents 디렉토리 제외 (기존 findLatestJsonl과 동일)
  // sessionId = 파일명에서 .jsonl 제거
  // projectPath = projects/ 하위 1단계 디렉토리명
  // mtime 기준 최신순 정렬
}
```

#### `src/cli/init.ts`
**대규모 수정 — Claude Code 의존성 제거:**

삭제할 함수:
- `installClaudeFiles()` — skills/agents/commands 복사 (L279-330)
- `setupClaudeAccess()` — settings.json에 볼트 경로/MCP 추가 (L366-392)
- `insertVaultRules()` — CLAUDE.md에 볼트 규칙 삽입 (L396-429)
- `collectJsonlPaths()` — 사용하지 않게 됨 (collect --all로 대체)

삭제할 메시지 키:
- `installingSkills`, `claudeIntegration`, `vaultRulesExist`, `vaultRulesInserted`
- `settingsAdded`, `cliNotFound`, `jsonlFound`, `historyIntro`

수정할 흐름 (`runInit()`):
```
1. 배너 출력
2. 볼트 경로 입력 (기존 유지)
3. 기본 질문 5개 (기존 유지 — MY-PROFILE.md 생성에 사용)
4. Claude 인증 확인 (기존 유지 — LLM 추출에 필요)
5. 볼트 구조 생성 (기존 createVaultStructure 유지)
6. MY-PROFILE.md 생성 (질문 답변 기반 — 신규)
7. config.yaml 저장 (기존 saveConfig 단순화)
8. 초기 수집 안내:
   "초기 볼트를 구성하려면: kore-chamber collect --all"
   "LLM API 토큰이 사용됩니다."
9. 완료 메시지 출력
```

수정할 메시지 키:
- `nextSteps` — Claude Code 관련 내용 제거, CLI 사용법으로 교체
```
다음 단계:
  1. kore-chamber collect --all  (과거 대화에서 초기 볼트 구성)
  2. 평소처럼 AI와 대화
  3. kore-chamber collect         (새 대화에서 지식 수집)
  4. kore-chamber status          (볼트 현황 확인)
```

#### `src/cli/doctor.ts`
- Claude Code CLI 존재 확인 제거 (있으면)
- Claude Code settings.json 관련 진단 제거 (있으면)
- 볼트 경로 유효성, config.yaml 상태, 인증 상태만 진단

#### `src/cli/status.ts`
- Claude Code 관련 표시 제거 (있으면)
- 처리된 세션 수 / 미처리 세션 수 표시 추가 (tracker 연동)

#### `package.json`
```json
{
  "name": "kore-chamber",
  "version": "0.4.0",  // 메이저 방향 전환이므로 버전 범프
  "description": "Auto-crystallize AI conversations into Obsidian notes",
  "files": [
    "dist/",
    "README.md"
    // ".claude/" 제거
  ],
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.85",
    "@modelcontextprotocol/sdk": "^1.28.0",  // mcp 유지하므로 유지
    "yaml": "^2.7.0"
  }
}
```

#### `CLAUDE.md` (프로젝트 룰)
전체 재작성:
```markdown
# Kore-Chamber — Project Rules

## Overview
독립 CLI 도구. AI 대화(Claude Code JSONL)를 분석해서 Obsidian 노트로 자동 저장.

- **Runtime**: TypeScript (Node.js ≥ 18)
- **CLI**: `kore-chamber` (init, collect, profile, status, doctor, mcp)
- **Input**: Claude Code JSONL (~/.claude/projects/)
- **Output**: Obsidian vault (Kore Protocol 형식)
- **Auth**: Claude OAuth (LLM 추출에 사용)
- **Config**: ~/.kore-chamber/config.yaml

## Architecture
CLI → JSONL Parser → LLM Extraction → Dedup → Vault Writer → MOC Linker

코드가 하는 것: JSONL 파싱, 노이즈 필터링, 중복 체크, 파일 생성, MOC 관리, 링크
AI가 하는 것: 지식 추출, borderline 중복 판단, 노트 병합

## Type Classification
1. Error → Cause → Fix? → Troubleshooting (20-Troubleshooting/)
2. Why B over A? → Decision (30-Decisions/)
3. What is X? → Concept (10-Concepts/)
4. Reusable method? → Pattern (40-Patterns/)
5. None → Inbox (00-Inbox/)

## Key Files
- src/core/jsonl.ts — JSONL 파싱 + 노이즈 필터링
- src/core/vault.ts — 노트 I/O + frontmatter
- src/core/dedup.ts — 한글 토크나이저 + Jaccard 유사도
- src/core/moc.ts — MOC 관리
- src/core/linker.ts — Spreading Activation 관련 노트 탐색
- src/llm/extract.ts — LLM 추출 프롬프트 + borderline 판단 + 병합
- src/cli/collect.ts — 수집 파이프라인 (메인 기능)

## Session Tracking
- ~/.kore-chamber/processed.yaml에 처리 완료 세션 기록
- collect는 미처리 세션만 자동 탐지
```

#### `README.md`
전체 재작성 — 새로운 포지셔닝에 맞게:
```markdown
# kore-chamber

AI 대화를 체계적으로 분류해서 Obsidian 노트로 자동 저장합니다.

## 설치
npx kore-chamber init

## 사용법
kore-chamber collect          # 최근 대화에서 노트 수집
kore-chamber collect --all    # 미처리 대화 전부 수집
kore-chamber profile          # 프로필 보기
kore-chamber status           # 볼트 통계

## 작동 방식
1. Claude Code 대화 로그(JSONL)를 파싱
2. LLM으로 학습 내용 추출 (개념/트러블슈팅/결정/패턴)
3. 기존 노트와 중복 체크
4. Obsidian 노트 생성 + MOC 연결 + 관련 노트 링크

## 볼트 구조
00-Inbox/           분류 전 임시
10-Concepts/        "X란 무엇인가"
20-Troubleshooting/ "에러 → 원인 → 해결"
30-Decisions/       "왜 B가 A보다 나은가"
40-Patterns/        재사용 가능한 구현 방법
50-MOC/             도메인별 인덱스
```

### 4.3 Create New (신규 파일)

#### `src/core/tracker.ts`
**목적**: 처리 완료된 JSONL 세션 추적

```typescript
// ~/.kore-chamber/processed.yaml 관리

interface ProcessedSession {
  processed_at: string;       // ISO 8601
  notes_created: number;
  source_file: string;        // 원본 JSONL 경로
}

interface ProcessedData {
  version: 1;
  sessions: Record<string, ProcessedSession>;  // key = sessionId
}

export function loadProcessed(): ProcessedData;
export function isProcessed(sessionId: string): boolean;
export function markProcessed(sessionId: string, sourceFile: string, notesCreated: number): void;
export function getUnprocessedSessions(allSessions: JsonlFileInfo[]): JsonlFileInfo[];
export function getProcessedCount(): number;
```

**구현 노트:**
- `~/.kore-chamber/processed.yaml` 파일 읽기/쓰기
- 파일 없으면 빈 상태로 초기화
- yaml 패키지로 직렬화 (이미 의존성에 있음)

#### `src/cli/profile.ts`
**목적**: MY-PROFILE.md 보기/편집

```typescript
export async function runProfile(args: string[]): Promise<void>;
```

**동작:**
- `kore-chamber profile` (인자 없음):
  - config에서 vaultPath 로드
  - `vaultPath/MY-PROFILE.md` 읽어서 터미널에 출력
  - 파일 없으면 "프로필이 없습니다. kore-chamber init을 먼저 실행하세요." 출력

- `kore-chamber profile edit`:
  - `$EDITOR` 환경변수로 에디터 실행 (없으면 `vi`)
  - `child_process.execSync("$EDITOR path/to/MY-PROFILE.md", { stdio: "inherit" })`

### 4.4 Delete (삭제)

| File/Directory | 이유 |
|----------------|------|
| `.claude/agents/scavenger.md` | Claude Code 에이전트 → 추출 로직은 extract.ts에 이미 구현됨 |
| `.claude/agents/sentinel.md` | Claude Code 에이전트 → dedup 로직은 dedup.ts에 이미 구현됨 |
| `.claude/agents/librarian.md` | Claude Code 에이전트 → vault write 로직은 vault.ts + collect.ts에 이미 구현됨 |
| `.claude/agents/explorer.md` | Claude Code 에이전트 → V2에서 CLI로 재구현 |
| `.claude/commands/kc-collect.md` | Claude Code 커맨드 → CLI collect로 대체 |
| `.claude/commands/kc-explore.md` | Claude Code 커맨드 → CLI explore로 대체 (V2) |
| `.claude/commands/kc-init.md` | Claude Code 커맨드 → CLI init으로 대체 |
| `.claude/skills/kc-collect/SKILL.md` | Claude Code 스킬 → CLI collect로 대체 |
| `src/cli/update.ts` | skills/agents 업데이트 목적 → 더 이상 불필요 |

**주의**: `.claude/agents/` 파일들의 **내용(판단 기준, 프롬프트 구조)**은 참고 자료로서 가치가 있음. 삭제 전 extract.ts의 프롬프트가 핵심 아이디어를 충분히 반영하는지 확인. 현재 extract.ts가 이미 대부분 반영하고 있으므로 별도 보존 불필요.

---

## 5. Init Flow (Before → After)

### Before
```
1. 배너 + 볼트 경로 입력
2. 질문 5개 (분야, 수준, 목표, 학습스타일, 관심영역)
3. 히스토리 옵션 선택 (전체/7일/건너뛰기)
4. Claude CLI 존재 확인                    ← 삭제
5. Claude OAuth 인증
6. 볼트 구조 생성
7. Skills/Agents/Commands 설치              ← 삭제
8. JSONL 경로 수집                          ← 삭제 (collect --all로 대체)
9. config.yaml + init-answers.yaml 저장
10. Claude Code settings.json 수정           ← 삭제
11. CLAUDE.md에 볼트 규칙 삽입               ← 삭제
12. 완료 메시지
```

### After
```
1. 배너 + 볼트 경로 입력
2. 질문 5개 (기존 유지 — MY-PROFILE.md 생성용)
3. Claude OAuth 인증 (LLM 추출에 필요)
4. 볼트 구조 생성 (기존 createVaultStructure)
5. MY-PROFILE.md 생성 (질문 답변 기반, 간단한 템플릿)
6. config.yaml 저장 (history_paths 필드 제거)
7. 완료 메시지 + 초기 수집 안내
```

### MY-PROFILE.md 생성 템플릿
```markdown
# MY-PROFILE

## 분야
{field}

## 현재 수준
{level}

## 목표
{goal}

## 학습 스타일
{learningStyle}

## 깊이 파고 싶은 영역
{deepInterest}

## 메모
(자유롭게 추가하세요)
```

---

## 6. Collect Flow (Before → After)

### Before
```
1. config 로드
2. JSONL 파싱 (최근 1개)
3. 볼트 요약 + MY-PROFILE 로드
4. LLM 추출 (knowledge_items + profile_updates)
5. 배치 dedup
6. 개별 dedup + borderline AI 판단
7. 계획 수립 (new/merge/skip)
8. 프로필 업데이트 계획 수립
9. 실행 (노트 생성 + 프로필 업데이트)
10. MOC 연결 + 관련 노트 링크
```

### After
```
1. config 로드
2. tracker 로드 → 미처리 세션 탐지
   - 기본 모드: 미처리 중 최근 1개
   - --all 모드: 미처리 전부
   - --session <id>: 특정 세션 (tracker 무시)
3. 각 세션에 대해:
   a. JSONL 파싱
   b. 3턴 미만 → 건너뛰기 (기존 유지)
   c. 볼트 요약 로드
   d. LLM 추출 (knowledge_items만)
   e. 배치 dedup (기존 유지)
   f. 개별 dedup + borderline AI 판단 (기존 유지)
   g. 계획 수립 (기존 유지, 프로필 부분 제거)
   h. 실행 (기존 유지, 프로필 부분 제거)
   i. MOC 연결 + 관련 노트 링크 (기존 유지)
   j. tracker에 처리 완료 기록
4. 최종 결과 출력
```

### 배치 모드 출력 형식
```
📥 미처리 세션 12개 발견
   LLM API 토큰이 사용됩니다.

[1/12] project-a/abc123.jsonl
   📝 3개 항목 추출, 2개 저장, 1개 중복
[2/12] project-b/def456.jsonl
   ⏭️  대화가 너무 짧습니다 (3턴 미만)
[3/12] project-a/ghi789.jsonl
   📝 1개 항목 추출, 1개 저장

━━━ Collect 완료 ━━━
  처리: 12개 세션
  저장: 8개 노트
  병합: 2개
  중복: 4개
  건너뜀: 3개 (짧은 대화)
━━━━━━━━━━━━━━━
```

---

## 7. Testing Checklist

### Phase 1: 기존 기능 유지 확인
- [ ] `npm run build` 성공
- [ ] `kore-chamber init` — 볼트 경로 입력, 질문 응답, 볼트 구조 생성, config.yaml 저장
- [ ] `kore-chamber collect --dry-run` — 최근 세션 파싱 + 추출 미리보기 (파일 변경 없음)
- [ ] `kore-chamber collect` — 실제 노트 생성 확인
- [ ] `kore-chamber status` — 볼트 통계 표시
- [ ] `kore-chamber doctor` — 진단 실행

### Phase 2: 신규 기능
- [ ] `kore-chamber collect --all` — 미처리 세션 전부 배치 처리
- [ ] `kore-chamber collect` 재실행 — 이미 처리된 세션 건너뛰기 확인
- [ ] `kore-chamber profile` — MY-PROFILE.md 출력
- [ ] `kore-chamber profile edit` — 에디터 열기
- [ ] `~/.kore-chamber/processed.yaml` — 처리 이력 확인

### Phase 3: 정리 확인
- [ ] `.claude/agents/` — 삭제됨
- [ ] `.claude/commands/` — 삭제됨
- [ ] `.claude/skills/` — 삭제됨
- [ ] `src/cli/update.ts` — 삭제됨
- [ ] `npm pack` — .claude/ 포함되지 않음

---

## 8. Work Order

### Step 1: 삭제 (가장 먼저, 깔끔한 상태에서 시작)
1. `.claude/agents/`, `.claude/commands/`, `.claude/skills/` 디렉토리 삭제
2. `src/cli/update.ts` 삭제

### Step 2: 신규 파일 생성
1. `src/core/tracker.ts` 생성
2. `src/cli/profile.ts` 생성

### Step 3: 핵심 수정 (의존 관계 순)
1. `src/llm/extract.ts` — profile 관련 코드 제거 (다른 파일이 의존)
2. `src/core/jsonl.ts` — `findAllJsonl()` 추가
3. `src/cli/collect.ts` — profile 제거 + --all 모드 + tracker 연동
4. `src/cli/init.ts` — Claude Code 의존성 제거 + MY-PROFILE 생성
5. `src/cli/index.ts` — 라우터 업데이트
6. `src/cli/doctor.ts` — Claude Code 진단 제거
7. `src/cli/status.ts` — tracker 통계 추가

### Step 4: 문서
1. `CLAUDE.md` 재작성
2. `README.md` 재작성
3. `package.json` 업데이트 (version, description, files)

### Step 5: 빌드 & 테스트
1. `npm run build`
2. Testing Checklist 실행

---

## 9. 범위 밖 (V2 이후)

- `explore` CLI 구현 (볼트 갭 분석)
- 다른 AI 포맷 지원 (ChatGPT JSON export 등)
- hook 기반 자동 수집 (세션 종료 시 자동 실행)
- MCP 자동 등록 (init 시 선택적)
- 에이전트 프롬프트 템플릿 분리 (`src/prompts/`)
- npm publish
