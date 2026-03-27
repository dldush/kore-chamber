# Kore Chamber

> Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

**Claude Code를 위한 하이브리드 지식 볼트 엔진**

### AI에게 나의 뇌를 선물하세요.

[English](README.md)

> *"I know that I know nothing."* — Socrates

## 소개

Kore Chamber는 Claude Code 대화를 Markdown 볼트에 축적하는 지식 관리 엔진입니다.  
핵심은 "AI가 전부 처리하는 프롬프트 묶음"이 아니라, **결정적인 일은 TypeScript 코어가 처리하고 의미 해석만 AI가 담당하는 하이브리드 구조**라는 점입니다.

### 무엇이 달라졌나

- **코드가 처리하는 일**: JSONL 파싱, 노이즈 제거, frontmatter 읽기/쓰기, 중복 검사, 파일 생성, MOC 링크, 관련 링크, 프로필 반영
- **AI가 처리하는 일**: 지식 후보 추출, 분류 보조, 경계선 중복 판정, 병합 문안 생성, 프로필 변화 감지
- **수집 타이밍은 사용자가 제어**: 세션 종료 시 자동 수집하지 않고, 필요할 때 명시적으로 실행합니다

### 이런 문제를 해결합니다

- AI와 많이 대화하지만 배운 내용이 세션이 끝나면 사라짐
- 비슷한 질문을 다시 하느라 컨텍스트 비용이 커짐
- 지금 내가 어디까지 이해했는지, 다음에 뭘 메워야 하는지 추적하기 어려움
- 메모를 남기더라도 구조화, 연결, 재활용이 어려움

### 동작 방식

```text
[Claude Code 대화]
        ↓
[/kc-collect 또는 kore-chamber collect]
        ↓
[TS 코어] transcript 파싱 · dedup · 저장 · 링크
        ↓
[AI] 지식 추출 · 분류 보조 · 프로필 변화 감지
        ↓
[Markdown Vault]
  - 10-Concepts
  - 20-Troubleshooting
  - 30-Decisions
  - 40-Patterns
  - 50-MOC
```

### 한 줄 요약

CLAUDE.md가 "작은 메모"라면, Kore Chamber는 **구조화된 개인 지식 그래프**입니다.

## 설치방법

### 요구사항

- Node.js 18+
- Claude Code CLI

### 1. 초기 설치

```bash
npx kore-chamber init
```

`init`이 수행하는 일:

1. Claude Code CLI 설치 여부를 확인합니다.
2. Claude OAuth 로그인을 확인합니다 (미로그인 시 브라우저가 열립니다).
3. 볼트 경로를 입력받고 기본 폴더 구조를 생성합니다.
4. 분야, 수준, 목표, 학습 스타일, 깊이 관심사를 질문합니다.
5. 기존 Claude 대화 로그 경로를 수집해 `config.yaml`에 저장합니다.
6. Claude Code용 명령/스킬/에이전트를 설치합니다.
   - `~/.claude/commands/kc-init.md`
   - `~/.claude/commands/kc-explore.md`
   - `~/.claude/skills/kc-collect/`
   - `~/.claude/agents/*.md`
7. 볼트 접근 경로를 Claude Code 설정에 추가합니다.
8. 전역 `~/.claude/CLAUDE.md`에 볼트 참조 규칙을 삽입합니다.

### 2. 초기 프로필 생성

설치가 끝나면 Claude Code 안에서 한 번 실행하세요.

```text
/kc-init
```

이 단계에서 `MY-PROFILE.md`와 초기 MOC가 생성됩니다.

### 3. 설치 확인

```bash
kore-chamber doctor
```

### 4. 업데이트

```bash
npx kore-chamber@latest update
```

`update`는 최신 명령/스킬/에이전트만 갱신하고, 기존 볼트와 설정은 유지합니다.

## 사용방법

### 가장 권장하는 흐름

1. 평소처럼 Claude Code에서 대화합니다.
2. 저장할 가치가 있는 대화가 끝나면 `/kc-collect`를 실행합니다.
3. 내부적으로 `kore-chamber collect --session ${CLAUDE_SESSION_ID}`가 실행됩니다.
4. 저장 결과를 요약해서 확인합니다.
5. 부족한 영역을 보고 싶으면 `/kc-explore`를 실행합니다.

### 터미널에서 직접 수집

```bash
kore-chamber collect
```

유용한 옵션:

```bash
kore-chamber collect --dry-run
kore-chamber collect --session <session-id>
kore-chamber collect --output json
```

- `--dry-run`: 실제 파일 변경 없이 저장 계획만 확인
- `--session`: 특정 세션 transcript 지정
- `--output json`: Claude Code 스킬이나 다른 자동화에서 읽기 쉬운 JSON 출력

### 상태 점검

```bash
kore-chamber doctor
kore-chamber status
```

- `doctor`: 설치 상태, 파일 누락, Claude CLI 존재 여부, 볼트 구조를 검사
- `status`: 노트 수, MOC 수, orphan note, broken link, 최근 수집 날짜를 표시

### 수집은 자동이 아닙니다

Kore Chamber는 세션 종료 시 무조건 자동 수집하지 않습니다.  
이건 의도된 설계입니다. 저장 시점을 사용자가 제어해야 중복 수집과 원치 않는 프로필 반영을 줄일 수 있기 때문입니다.

## 기능 상세 설명

### 아키텍처

```text
src/
├── cli/
│   ├── index.ts
│   ├── init.ts
│   ├── update.ts
│   ├── collect.ts
│   ├── doctor.ts
│   └── status.ts
├── core/
│   ├── config.ts
│   ├── jsonl.ts
│   ├── vault.ts
│   ├── dedup.ts
│   ├── slug.ts
│   ├── moc.ts
│   └── linker.ts
├── llm/
│   ├── claude.ts
│   └── extract.ts
└── templates/
    └── AI-GUIDE.md
```

### `collect` 파이프라인

`kore-chamber collect`는 아래 순서로 동작합니다.

1. `config.yaml`에서 `vault_path`를 읽습니다.
2. 세션 ID가 있으면 해당 transcript를, 없으면 가장 최근 JSONL을 찾습니다.
3. JSONL에서 사용자/어시스턴트 텍스트만 추출하고, tool output과 시스템 잡음을 제거합니다.
4. 사용자 턴이 3개 미만이면 가치가 낮다고 보고 early exit 합니다.
5. 기존 볼트의 `summary`, `tags`, `type`, `links`, `MY-PROFILE.md`를 읽습니다.
6. 정제된 대화 텍스트를 AI에 보내 구조화된 JSON으로 추출합니다.
   - `knowledge_items[]`
   - `profile_updates[]`
7. 배치 내부 중복을 먼저 제거합니다.
8. 각 항목에 대해 볼트 기준 중복 검사를 수행합니다.
   - 명백한 중복은 코드가 바로 스킵
   - 애매한 구간은 AI가 `new | merge | skip`를 판정
9. 새 노트는 slug를 생성하고 카테고리 폴더에 저장합니다.
10. 병합 대상이 있으면 기존 노트와 Evergreen 방식으로 합칩니다.
11. 태그 기준으로 가장 적합한 MOC를 찾아 `[[slug]]`를 추가합니다.
12. 관련 노트를 탐색해 양방향 위키링크를 추가합니다.
13. 같은 배치에서 함께 나온 노트끼리도 상호 링크합니다.
14. 프로필 업데이트는 신뢰도에 따라 처리합니다.
   - `high`: 자동 반영
   - `medium`: 보류 후 사용자 확인
   - `low`: 무시
15. 마지막에 사람이 읽기 쉬운 요약 또는 JSON 결과를 출력합니다.

### 코드와 AI의 책임 분리

| 영역 | 담당 | 이유 |
|---|---|---|
| JSONL 탐색/파싱 | 코드 | 결정적 작업 |
| 노이즈 제거 | 코드 | 규칙 기반 처리 가능 |
| frontmatter 읽기/쓰기 | 코드 | 파일 일관성 필요 |
| 중복 1차 검사 | 코드 | 빠르고 재현 가능해야 함 |
| 경계선 중복 판정 | AI | 의미 해석 필요 |
| 노트 병합 문안 | AI 보조 + 코드 저장 | 자연스러운 합성 필요 |
| slug 생성 | 코드 | 규칙 일관성 필요 |
| MOC 추가/링크 반영 | 코드 | 부작용 있는 작업 |
| 지식 후보 추출 | AI | 의미 해석 필요 |
| 프로필 변화 감지 | AI | 문맥 이해 필요 |

### 볼트 구조

```text
vault/
├── AI-GUIDE.md
├── MY-PROFILE.md
├── 00-Inbox/
├── 10-Concepts/
├── 20-Troubleshooting/
├── 30-Decisions/
├── 40-Patterns/
├── 50-MOC/
└── Templates/
```

- `10-Concepts`: 개념 설명
- `20-Troubleshooting`: 문제, 원인, 해결
- `30-Decisions`: 대안 비교와 선택 이유
- `40-Patterns`: 재사용 가능한 구현 패턴
- `50-MOC`: 도메인별 인덱스

### MOC와 링크 전략

- MOC는 노트 타입이 아니라 **주제/도메인 기준**으로 관리합니다.
- 관련 링크는 3단계 탐색으로 찾습니다.
  - 1차: tags 2개 이상 겹침 또는 summary 키워드 매칭
  - 2차: 1차 노트의 `## 관련 노트`
  - 3차: 같은 MOC에 속한 노트
- 같은 collect 배치에서 나온 항목은 함께 링크합니다.

### `doctor`

`doctor`는 아래를 검사합니다.

- `~/.kore-chamber/config.yaml`
- `~/.kore-chamber/init-answers.yaml`
- `vault_path` 접근 가능 여부
- 볼트 폴더 구조
- `AI-GUIDE.md`, `MY-PROFILE.md`
- Claude Code 명령/에이전트 설치 상태
- `claude` CLI 존재 여부

### `status`

`status`는 아래를 보여줍니다.

- 폴더별 노트 수
- 총 노트 수
- MOC 수
- MOC에 연결되지 않은 orphan note 수
- 존재하지 않는 위키링크 수
- 최근 수집 날짜

### 설계 원칙

- **결정적인 작업은 코드로**
- **애매한 작업만 AI로**
- **저장은 명시적으로**
- **Markdown을 소스 오브 트루스로 유지**
- **CLI 출력은 사람용 markdown과 기계용 JSON 둘 다 지원**

## License

MIT
