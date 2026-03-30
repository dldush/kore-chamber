# Kore Chamber

Claude 대화 로그를 구조화된 Obsidian 노트로 바꾸는 CLI입니다.

[English](README.md) · [Kore Protocol](PROTOCOL.md)

## 무엇을 하는 도구인가

Kore Chamber는 `~/.claude/projects/` 아래의 Claude JSONL 세션을 읽고, LLM으로 재사용 가능한 지식을 추출한 뒤, 중복을 걸러서 Obsidian 볼트에 저장합니다.

- 입력: Claude 세션 JSONL
- 출력: Obsidian 마크다운 노트 + MOC 링크
- 런타임: Node.js 18+
- 인증: 추출 시 `claude` CLI 로그인 필요
- 선택 기능: `kore-chamber mcp`로 MCP 서버를 수동 실행 가능

## 설치

```bash
npx kore-chamber init
```

`init`이 수행하는 일:

1. `claude` CLI 설치 여부 확인
2. Claude 인증 확인
3. 볼트 기본 구조 생성
4. 프로필 질문 5개 수집
5. `MY-PROFILE.md` 생성
6. `~/.kore-chamber/config.yaml` 저장

## 사용법

```bash
kore-chamber collect
kore-chamber collect --all
kore-chamber collect --session <session-id>
kore-chamber collect --dry-run

kore-chamber profile
kore-chamber profile edit

kore-chamber status
kore-chamber doctor
kore-chamber mcp
```

- `collect`: 아직 처리하지 않은 최신 세션 1개 수집
- `collect --all`: 미처리 세션 전체 수집
- `collect --session`: 세션 추적 상태를 무시하고 특정 세션 수집
- `collect --dry-run`: 노트/추적 파일을 쓰지 않고 미리보기만 실행
- `profile`: `MY-PROFILE.md` 출력
- `profile edit`: `$EDITOR`로 `MY-PROFILE.md` 열기
- `mcp`: 원할 때만 MCP 서버를 수동 실행

`kore-chamber explore`는 다음 버전용 예약 명령이며 현재는 플레이스홀더만 제공합니다.

## 동작 방식

```text
Claude JSONL
    ↓
JSONL 파싱 + 노이즈 제거
    ↓
LLM 지식 추출
    ↓
중복 검사 + 병합 판정
    ↓
Obsidian 노트 저장
    ↓
MOC + 관련 링크 갱신
```

지식은 아래 폴더에 분류됩니다.

- `10-Concepts`
- `20-Troubleshooting`
- `30-Decisions`
- `40-Patterns`
- `50-MOC`

처리 완료한 세션은 `~/.kore-chamber/processed.yaml`에 기록되므로, 기본 `collect`는 미처리 세션만 다시 집습니다.
