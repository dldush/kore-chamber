# Kore Chamber

> Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

**이 프로젝트가 하는 일은 당신의 Claude Code에 에이전트와 스킬을 등록하는 것뿐입니다.**

### AI에게 나의 뇌를 선물하세요.

[English](README.md)

> *"I know that I know nothing."* — Socrates

AI는 매번 당신을 처음 만납니다. 어제 뭘 배웠는지, 지금 어떤 수준인지, 어디를 목표로 하는지 모릅니다. Kore-Chamber는 이 한계를 넘깁니다.

## 시작하기

```bash
npx kore-chamber init
```

아니면 AI에게 이 링크와 함께 말하세요: **"kore-chamber 설치해줘"**
```
https://raw.githubusercontent.com/dldush/kore-chamber/main/docs/guide/installation.md
```

## 왜 써야 하나

- **AI가 나를 기억합니다.** 세션이 바뀌어도 AI는 당신의 수준, 목표, 선호를 알고 대화합니다. 매번 "나는 프론트엔드 개발자고..."부터 설명할 필요 없습니다.
- **대화만 하면 지식이 쌓입니다.** 직접 정리할 필요 없습니다. collect가 분류하고, 연결하고, 저장합니다. 당신은 배우기만 하면 됩니다.
- **뭘 모르는지 알 수 있습니다.** explore가 당신의 목표 대비 빈 곳을 보여줍니다. "다음에 뭘 공부하지?"가 사라집니다.
- **쓸수록 정교해집니다.** 볼트가 쌓일수록 AI의 개인화가 깊어지고, 연결이 많아지고, 갭 분석이 정밀해집니다. 노트 N개의 가능한 연결은 N×(N-1)/2 — 복리로 성장합니다.

## 이런 분들을 위해

- AI랑 대화는 많이 하는데, **배운 게 날아가는** 분
- 얕고 넓게 BFS로 학습하다가 **어디까지 공부했는지 컨텍스트를 잃는** 분
- AI가 매번 나를 **처음부터 설명해야 하는 게 답답한** 분
- **"뭘 모르는지 모르겠다"**는 순간이 있는 분

## 어떻게 동작하나

**평소처럼 AI와 대화하세요.** 끝날 때 `collect` 한 번이면 됩니다.

```
[평소] AI와 자유 대화 — 학습, 코딩, 트러블슈팅, 뭐든
                              ↓
[끝날 때] /kc-collect → 대화 속 지식이 자동으로 볼트에 저장
                              ↓
                    볼트가 쌓일수록 AI가 당신을 이해
                              ↓
[막힐 때] /kc-explore → "당신은 이걸 모르고 있습니다"
```

- **collect**: 대화에서 지식 + 사용자 프로필을 자동 추출 → 검증 → 분류 → 저장 → 연결
- **explore**: 당신의 목표 대비 볼트의 빈 곳을 보여줌. unknown unknowns → known unknowns

## CLAUDE.md의 한계를 넘어섭니다

Claude Code의 `CLAUDE.md`와 `MEMORY.md`는 좋은 시작이지만 한계가 있습니다.

| | CLAUDE.md / MEMORY.md | Kore-Chamber |
|---|---|---|
| **저장** | 메모리 파일, 200줄 제한 | 물리적 Markdown 파일, **크기 제한 없음** |
| **구조** | 플랫한 텍스트 | MOC + 위키링크 + frontmatter로 **구조화된 지식 그래프** |
| **탐색** | 파일 하나를 통째로 읽기 | Spreading Activation으로 **관련 지식만 빠르게 탐색** |
| **범위** | 프로젝트별 분리 | **전역** — 어떤 프로젝트에서든 당신의 전체 지식에 접근 |
| **분류** | 수동 | 에이전트가 **자동 분류 + 자동 연결** |

CLAUDE.md가 메모라면, Kore-Chamber는 **진짜 뇌**입니다.

## 왜 다른가

| 기존 | Kore-Chamber |
|------|-------------|
| AI가 매번 나를 처음 만남 | 볼트를 통해 **당신의 수준, 목표, 지식을 기억** |
| 대화가 끝나면 배운 게 사라짐 | collect로 **자동 수확, 분류, 연결** |
| 뭘 모르는지 모름 | explore가 **빈 곳을 보여줌** |
| 노트 정리는 내가 해야 함 | AI가 **전부 자동으로** |

## 에이전트 시스템

### Collect 파이프라인: `scavenger → sentinel → librarian`

#### Scavenger — 수확기

대화 종료 후 세션 JSONL 로그에서 지식과 사용자 프로필 변화를 추출합니다.

**두 트랙으로 추출:**
- **Track 1 (지식)**: 개념, 트러블슈팅, 결정, 패턴 → Sentinel을 거쳐 볼트에 저장
- **Track 2 (프로필)**: 수준 변화, 새 목표, 선호/성향 → MY-PROFILE.md에 자동 반영

**적용 방법론:**

| 방법론 | 분야 | 적용 |
|--------|------|------|
| Content Analysis | 질적 연구 | **Manifest**(명시적으로 말한 것) + **Latent**(대화 패턴에서 추론되는 것) 이중 분석 |
| User Modeling | HCI/UX | **Knowledge**(뭘 아는지) × **Goal**(뭘 원하는지) × **Preference**(어떻게 원하는지) 3축 모델링 |
| Bloom's Taxonomy | 교육학 | 대화에서 도메인별 이해 수준을 6단계(기억→이해→적용→분석→평가→창조)로 판별 |
| Schema Theory | 인지 심리학 | 프로필 업데이트 시 **Assimilation**(기존과 일치→추가) / **Accommodation**(충돌→교체) 전략 |

#### Sentinel — 품질 게이트

스캐빈저가 추출한 지식 항목을 검증하고, 불완전하면 **보완**합니다. 버리는 것보다 고치는 것을 우선.

**루브릭 (4기준):**
- **Accuracy** — 원본 JSONL을 직접 대조하여 정확성 교차 검증
- **Completeness** — 불완전하면 원본 대화에서 빠진 맥락을 찾아 보완
- **Distinctness** — 하나의 주제인가
- **Novelty** — 기존 노트의 `summary`와 의미적 비교 + 배치 내 중복 체크

**적용 방법론:**

| 방법론 | 분야 | 적용 |
|--------|------|------|
| Cross-validation | 통계학 | 추출 항목을 **원본 JSONL의 해당 부분과 직접 대조** — LLM 자기 평가의 blind spot 보완 |
| Triangulation | 질적 연구 | 제목, 내용, 원본 대화 **3개 소스를 교차 확인**하여 왜곡/환각 감지 |
| Fuzzy matching | 정보 검색 | 키워드 exact match 대신 기존 노트 `summary`와 **의미 기반 유사도 비교** |

> **Supplement over reject.** 불완전한 항목을 버리지 않고, 원본 대화에서 빠진 맥락을 찾아 보완 후 통과시킵니다.

#### Librarian — 배치 + 저장 + 연결

Sentinel을 통과한 항목을 메인 볼트에 직접 저장하고, 프로필 업데이트를 적용합니다.

**6단계 처리:**
1. 타입 분류 (확신도 체크 포함)
2. 파일명 결정 + 기존 노트와 의미적 중복 감지
3. 새 노트 생성 또는 기존 노트에 Evergreen 병합
4. 메인 볼트에 저장
5. MOC 링크 + 토픽 기반 자동 분할
6. 교차 타입/교차 도메인 연결 자동 링크

**적용 방법론:**

| 방법론 | 분야 | 적용 |
|--------|------|------|
| Faceted Classification | 도서관학 | 타입(1차) + 도메인 + 추상화 수준(2차) **다면 분류**로 오분류 감소 |
| Evergreen Notes | Andy Matuschak | 같은 파일명 또는 **summary가 겹치는 기존 노트**에 병합 — 중복 파일 대신 기존 노트 성장 |
| Spreading Activation | 인지 심리학 | 뇌 신경망처럼 **시작점에서 연결을 따라 활성화 확산** — 1차(직접 매칭) → 2차(링크 따라감) → 3차(같은 MOC) |
| Hebbian Learning | 신경과학 | "함께 발화하는 뉴런은 함께 연결된다" — 같은 대화에서 추출된 항목들을 **자동 상호 연결** |
| Topic Modeling | NLP | MOC 분할 시 카운트가 아닌 **노트 summary 클러스터링**으로 자연스러운 하위 그룹 발견 |

**프로필 업데이트**: Schema Theory 기반으로 MY-PROFILE.md에 Assimilation/Accommodation 적용

### Explore: `explorer`

#### Explorer — 갭 분석가

볼트의 현재 상태를 정밀 스캔하고, 사용자의 목표 대비 빈 곳을 보여줍니다.

**5단계 분석:**
1. **Vault Intelligence** — 도메인별 커버리지, 연결 밀도, 타입 분포
2. **Competency Mapping** — 목표별 역량 의존성 트리 생성 → 볼트 매핑
3. **Gap Analysis** — 목표 기반 갭, 깊이 갭, 연결 갭
4. **Learning Direction** — ZPD 기반 3~5개 구체적 학습 추천
5. **Exploration Log** — 추천 이력 기록으로 반복 추천 방지 + 학습 궤적 추적

**적용 방법론:**

| 방법론 | 분야 | 적용 |
|--------|------|------|
| Competency Mapping | HR/교육 | 목표별 **역량 의존성 트리** 생성 → 볼트 노트를 트리에 매핑 → 빈 노드 = 갭 |
| Zone of Proximal Development | Vygotsky/교육심리 | 현재 수준에서 **약간만 확장되는 토픽**을 우선 추천 — 기반 없는 고급 주제 배제 |
| Curriculum Learning | ML/교육 | 역량 트리의 **의존성 순서** 존중 — "비동기를 모르면 이벤트 루프를 배울 수 없다" |
| Spreading Activation | 인지 심리학 | 각 MOC에서 활성화를 확산하여 **dead zone**(고립 지식), **activation cliff**(연결 끊김), **bridge node**(도메인 연결점) 감지 |

## 설치

```bash
npx kore-chamber init
```

1. 볼트 경로 지정
2. 5가지 질문 (분야, 수준, 목표, 학습 스타일, 관심 영역)
3. 기존 Claude 대화 로그를 스캔하여 초기 볼트 자동 구축 (History to Chamber)
4. Claude Code에 스킬 + 에이전트 + 볼트 탐색 규칙 설치
5. 전역 CLAUDE.md에 볼트 참조 규칙 삽입 — 모든 세션에서 AI가 당신을 알고 대화

## 볼트 탐색: Spreading Activation

정적 경로(AI-GUIDE → MOC → 노트)가 아닌, **뇌 신경망의 확산 활성화** 모델로 탐색합니다.

```
시작점: "JWT"에 대해 질문
    ↓
1차 활성화 (강): summary가 JWT와 직접 관련된 노트
    → [[httpOnly-Cookie-인증]], [[토큰-갱신-전략]]
    ↓
2차 활성화 (중): 1차 노트들의 관련 노트 링크를 따라감
    → [[XSS-방어]], [[CORS-설정]]
    ↓
3차 활성화 (약): 같은 MOC 내 다른 노트
    → MOC-보안의 나머지 노트들
    ↓
역치 이하: 활성화 안 됨
```

| 원리 | 출처 | 적용 |
|------|------|------|
| Spreading Activation | Collins & Loftus, 1975 | 연결을 따라 활성화가 확산, 거리에 따라 감쇠 |
| Hebbian Learning | Hebb, 1949 | 같은 대화에서 추출된 항목들은 자동으로 상호 연결 |

## Obsidian 추천

Kore-Chamber는 Markdown 파일 기반이라 옵시디언 없이도 동작합니다. 메모장으로 열어도 됩니다.

**그런데 옵시디언을 꼭 쓰세요.** Spreading Activation으로 만들어진 연결들이 그래프 뷰에서 빛납니다. 당신의 뇌가 자라나는 걸 눈으로 볼 수 있습니다. 노트가 100개를 넘어가면 그래프 뷰를 켜놓고 멍하니 보게 됩니다. 그게 당신의 뇌입니다.

## 기술 스택

- **에이전트 런타임**: Claude Code (Skills + Agent Teams)
- **지식 저장소**: Markdown (Obsidian 강력 추천)
- **init CLI**: TypeScript (npm)
- **탐색 알고리즘**: Spreading Activation (별도 인프라 없이 위키링크 + tag + MOC 기반)

## License

MIT
