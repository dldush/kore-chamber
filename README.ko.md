# Kore Chamber

**The memory layer for Claude.**

[English](README.md) · [Kore Protocol](PROTOCOL.md)

Kore Chamber는 hooks를 통해 Claude Code에 연결됩니다. 세션 시작 시 과거 지식을 컨텍스트로 주입하고, 프롬프트를 입력할 때마다 관련 노트를 찾아 붙이고, 세션이 끝나면 새 지식을 자동으로 수집합니다.

- 입력: Claude 세션 JSONL (`~/.claude/projects/`)
- 출력: Obsidian 볼트 노트 + MOC 링크
- 런타임: Node.js 18+

## 설치

```bash
npx kore-chamber
```

첫 실행 시 설치가 자동으로 시작됩니다:

1. 볼트 경로 — 노트를 저장할 위치 (기본값: `~/Documents/KoreChamber`)
2. 프로필 — 분야, 수준, 목표 등 5개 질문
3. Claude CLI + 인증 확인
4. 볼트 구조 생성 + `MY-PROFILE.md` + `AI-GUIDE.md`
5. Claude hooks 등록 — SessionStart, UserPromptSubmit, SessionEnd
6. 부트스트랩 — 과거 세션을 지금 바로 수집할지 선택

설치 완료 후부터는 실행하면 바로 커맨드 콘솔이 열립니다.

> **참고:** hook 자동화는 실행 경로가 안정적이어야 합니다. hooks를 사용하려면 전역 설치를 권장합니다: `npm install -g kore-chamber`

## 동작 방식

hooks가 설치되면 Kore Chamber는 백그라운드에서 자동으로 동작합니다:

```
세션 시작
  → MY-PROFILE 요약 + 최근 노트 → Claude 컨텍스트에 주입

프롬프트 입력
  → 키워드로 관련 볼트 노트 매칭 → 주입

세션 종료
  → JSONL 큐 등록 → 백그라운드 worker → collect → 볼트 업데이트

다음 세션
  → 새 지식이 이미 컨텍스트에 반영됨
```

볼트는 세션마다 쌓입니다. Claude를 많이 쓸수록 컨텍스트 품질이 올라갑니다.

### Init

`kore-chamber`를 처음 실행하면 `~/.claude/projects/` 아래의 기존 Claude 세션 기록을 전부 탐색해 볼트를 초기 구축합니다. 모든 과거 대화를 파싱해 노이즈를 걸러낸 뒤, LLM이 재사용 가능한 지식(개념, 결정, 패턴, 트러블슈팅)을 추출하고 구조화된 Obsidian 노트로 저장합니다. 수개월치 대화가 명령 하나로 정리된 지식 베이스로 바뀝니다.

### Collect

Collect는 지식 추출 엔진입니다. Claude 세션 JSONL을 읽고, 노이즈를 제거한 뒤, 의미 있는 대화를 LLM에 보내 남길 지식을 추려냅니다. 저장 전에는 기존 노트와 비교해 새 노트 생성, 기존 노트 병합, 중복 스킵 중 하나를 선택합니다. hooks가 설치되어 있으면 세션이 끝날 때마다 백그라운드에서 자동 실행됩니다. 직접 실행할 필요가 없습니다.

### Injection

세션 시작 시 `MY-PROFILE.md`를 읽고, 최근 노트를 최신성·신뢰도·현재 프로젝트 디렉터리와의 관련도로 채점해 상위 결과를 Claude의 `additionalContext`에 주입합니다. 프롬프트를 입력할 때도 같은 채점이 프롬프트 텍스트를 기준으로 다시 실행되고, 가장 관련 있는 노트가 첨부됩니다. Claude는 항상 당신이 누구인지, 무엇을 이미 알고 있는지 알고 있습니다.

### Explore

> *"나는 내가 모른다는 사실을 안다."* — 소크라테스

자신이 무엇을 모르는지 아는 것이 진짜 성장의 시작입니다. `explore`는 볼트에 쌓인 지식과 `MY-PROFILE.md`에 적힌 목표를 비교 분석해, 당신의 진행을 가로막고 있는 공백을 드러냅니다. 건너뛴 기초, 알고 있다고 착각하는 개념, 인식조차 못 했던 사각지대까지.

단순한 추천 목록이 아닙니다. 지금 당신이 있는 위치와 가려는 곳 사이의 델타에서 도출한 갭 맵입니다. 열심히 하고 있는데 성장이 느껴지지 않을 때, 또는 다음 학습 방향을 잡고 싶을 때 실행하세요.

## 커맨드

```bash
# 단발 실행
kore-chamber collect               # 미처리 최신 세션 1개 수집
kore-chamber collect --all         # 미처리 세션 전체 수집
kore-chamber collect --dry-run     # 저장 없이 미리보기
kore-chamber status                # 볼트 통계

# 프로필
kore-chamber profile               # MY-PROFILE.md 업데이트
kore-chamber profile show          # 현재 프로필 출력
kore-chamber profile edit          # $EDITOR로 직접 편집

# 자동화
kore-chamber hooks install         # Claude hooks 수동 등록
kore-chamber queue show            # 자동 수집 큐 상태 확인
kore-chamber queue worker          # pending 큐 처리

# 컨텍스트 (hooks가 내부적으로 사용)
kore-chamber context session       # SessionStart용 컨텍스트
kore-chamber context prompt        # UserPromptSubmit용 컨텍스트

# 기타
kore-chamber init                  # 설치 재실행
kore-chamber doctor                # 설치 상태 진단 (볼트 / 인증 / hooks)
kore-chamber mcp                   # MCP 서버 수동 실행
```

## 볼트 구조

```
vault/
├── AI-GUIDE.md          ← Claude에게 전달되는 안내 문서
├── MY-PROFILE.md        ← 분야, 수준, 목표
├── 00-Inbox/
├── 10-Concepts/
├── 20-Troubleshooting/
├── 30-Decisions/
├── 40-Patterns/
└── 50-MOC/
```

처리 완료한 세션은 `~/.kore-chamber/processed.yaml`에 기록됩니다. `collect`를 반복 실행해도 새 세션만 처리합니다.
