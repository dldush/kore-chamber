import type { TopicCoverage } from "./vault-coverage.js";
import type { GoalTopic } from "./goal-parser.js";

// ─── Types ───

export type ExploreResultType = "missing" | "shallow" | "fragile";

export interface ExploreItem {
  type: ExploreResultType;
  topic: GoalTopic;
  coverage: TopicCoverage;
  reason: string;
  evidence: string;
  nextStep: string;
}

// ─── Classification ───

function classifyTopic(cov: TopicCoverage): ExploreResultType | null {
  // Missing: no notes at all
  if (cov.noteCount === 0) return "missing";

  // Shallow: only one note type (usually concept), no troubleshooting/pattern
  const hasDepth = !!(cov.typeBreakdown.troubleshooting || cov.typeBreakdown.pattern);
  if (!hasDepth && cov.noteCount <= 2) return "shallow";

  // Fragile: notes exist but structurally weak
  const lowConfidence = cov.maxConfidence < 0.6;
  const stale = cov.avgFreshness === "stale";
  const disconnected = !cov.linkedFromMOC && cov.isolated;

  if ((lowConfidence && stale) || (stale && disconnected)) return "fragile";

  return null;
}

// ─── Reason builders ───

function buildReason(cov: TopicCoverage, type: ExploreResultType): string {
  switch (type) {
    case "missing":
      return "목표에 포함되어 있으나 관련 노트가 없음";
    case "shallow": {
      const types = Object.keys(cov.typeBreakdown).join(", ");
      const mocNote = cov.linkedFromMOC ? "" : ", MOC 미연결";
      return `노트 ${cov.noteCount}개(${types})뿐, 트러블슈팅·패턴 없음${mocNote}`;
    }
    case "fragile": {
      const signals: string[] = [];
      if (cov.maxConfidence < 0.6) signals.push(`confidence ${cov.maxConfidence.toFixed(1)}`);
      if (cov.avgFreshness === "stale") signals.push("오래 참조 안 됨");
      if (cov.isolated) signals.push("연결 없음");
      if (!cov.linkedFromMOC) signals.push("MOC 미등록");
      return `노트 있으나 약함: ${signals.join(", ")}`;
    }
  }
}

function buildEvidence(cov: TopicCoverage, type: ExploreResultType): string {
  switch (type) {
    case "missing":
      return `noteCount=0, linkedFromMOC=false`;
    case "shallow": {
      const typeList = Object.entries(cov.typeBreakdown)
        .map(([t, n]) => `${t}×${n}`)
        .join(", ");
      return `noteCount=${cov.noteCount}, types=[${typeList}], linkedFromMOC=${cov.linkedFromMOC}`;
    }
    case "fragile":
      return `noteCount=${cov.noteCount}, maxConfidence=${cov.maxConfidence.toFixed(1)}, freshness=${cov.avgFreshness}, isolated=${cov.isolated}, linkedFromMOC=${cov.linkedFromMOC}`;
  }
}

function buildNextStep(type: ExploreResultType): string {
  switch (type) {
    case "missing":
      return "개념 노트 1개 작성 → 실습 후 트러블슈팅 기록";
    case "shallow":
      return "트러블슈팅 또는 패턴 노트 추가 → MOC에 등록";
    case "fragile":
      return "노트 복습 후 last_referenced 갱신 → 연관 노트에 링크 추가";
  }
}

// ─── Main ───

const TYPE_ORDER: Record<ExploreResultType, number> = { missing: 0, shallow: 1, fragile: 2 };
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function classifyTopics(coverages: TopicCoverage[]): ExploreItem[] {
  const items: ExploreItem[] = [];

  for (const cov of coverages) {
    const type = classifyTopic(cov);
    if (!type) continue;

    items.push({
      type,
      topic: cov.topic,
      coverage: cov,
      reason: buildReason(cov, type),
      evidence: buildEvidence(cov, type),
      nextStep: buildNextStep(type),
    });
  }

  return items.sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    const ap = PRIORITY_ORDER[a.topic.priority ?? "medium"];
    const bp = PRIORITY_ORDER[b.topic.priority ?? "medium"];
    return ap - bp;
  });
}
