import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { getAllSummaries, readProfile } from "../core/vault.js";
import { ensureAuth, queryLLM } from "../llm/claude.js";
import { runMigrations } from "../core/migrate.js";
import { parseGoalTopics } from "../core/goal-parser.js";
import { collectVaultCoverage } from "../core/vault-coverage.js";
import { classifyTopics, type ExploreItem } from "../core/explore-classify.js";

// ─── LLM interpretation types ───

interface AdjacentItem {
  name: string;
  reason: string;
  relatedTo: string;
  nextStep: string;
}

interface LLMInterpretation {
  adjacent: AdjacentItem[];
  observation: string;
}

const INTERPRETATION_SCHEMA = {
  type: "object",
  properties: {
    adjacent: {
      type: "array",
      description: "2-3 topics NOT in the goals list but are natural next steps based on what is missing/shallow",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "topic name" },
          reason: { type: "string", description: "why this is a natural next step" },
          relatedTo: { type: "string", description: "which goal or missing topic this is adjacent to" },
          nextStep: { type: "string", description: "one concrete action to start learning this" },
        },
        required: ["name", "reason", "relatedTo", "nextStep"],
      },
    },
    observation: {
      type: "string",
      description: "1-2 sentences: overall learning trajectory assessment and what to prioritize next",
    },
  },
  required: ["adjacent", "observation"],
};

// ─── LLM interpretation ───

async function interpretResults(
  goalsText: string,
  items: ExploreItem[],
  coveredTopics: string[]
): Promise<LLMInterpretation> {
  const missing = items.filter((i) => i.type === "missing").map((i) => i.topic.name);
  const shallow = items.filter((i) => i.type === "shallow").map((i) => i.topic.name);
  const fragile = items.filter((i) => i.type === "fragile").map((i) => i.topic.name);

  const prompt = `You are a learning advisor. Based on structured vault analysis, suggest adjacent topics and provide an overall assessment.

## User Goals
${goalsText}

## Vault Analysis
Missing (no notes): ${missing.length > 0 ? missing.join(", ") : "none"}
Shallow (concepts only, no depth): ${shallow.length > 0 ? shallow.join(", ") : "none"}
Fragile (weak signal, stale): ${fragile.length > 0 ? fragile.join(", ") : "none"}
Covered (well-established): ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "none"}

## Your task
1. Adjacent: suggest 2-3 topics that are NOT in the goals list but are natural next steps given what is missing or shallow. These should be topics the user will likely encounter soon.
2. Observation: 1-2 sentences on the overall learning trajectory. What is well-covered? What is the biggest blind spot? What should they tackle first?

Write in Korean. Respond as JSON.`;

  return queryLLM<LLMInterpretation>(prompt, INTERPRETATION_SCHEMA);
}

// ─── Output rendering ───

function printItems(items: ExploreItem[], type: ExploreItem["type"], log: (...a: unknown[]) => void): void {
  const filtered = items.filter((i) => i.type === type);
  if (filtered.length === 0) return;

  const labels = { missing: "Missing", shallow: "Shallow", fragile: "Fragile" };
  log(`\n━━━ ${labels[type]} ━━━`);

  for (const item of filtered) {
    const priorityMark = item.topic.priority === "high" ? " 🔴" : item.topic.priority === "low" ? " 🟢" : "";
    log(`  ${item.topic.name}${priorityMark}`);
    log(`  이유: ${item.reason}`);
    log(`  근거: ${item.evidence}`);
    log(`  다음 단계: ${item.nextStep}`);
    log("");
  }
}

function printAdjacent(adjacent: AdjacentItem[], log: (...a: unknown[]) => void): void {
  if (adjacent.length === 0) return;
  log("━━━ Adjacent ━━━");
  for (const item of adjacent) {
    log(`  ${item.name}`);
    log(`  이유: ${item.reason} (← ${item.relatedTo})`);
    log(`  다음 단계: ${item.nextStep}`);
    log("");
  }
}

// ─── Main ───

export async function runExplore(args: string[] = []) {
  runMigrations();

  const isJson = args.includes("--output") && args[args.indexOf("--output") + 1] === "json";
  const forceRefresh = args.includes("--refresh");
  const log = isJson ? () => {} : console.log.bind(console);

  const { vaultPath } = loadConfig();

  log("\n🔍 Kore Chamber — explore\n");

  // 1. Vault scan
  log("📊 볼트 스캔 중...");
  const summaries = getAllSummaries(vaultPath);

  if (summaries.length === 0) {
    log("\n  볼트가 비어있습니다. `kore-chamber collect`로 먼저 지식을 수집하세요.\n");
    return;
  }

  const profile = readProfile(vaultPath);

  // 2. Goal parsing (LLM, cached)
  log("🎯 목표 파싱 중...");
  ensureAuth();
  const topics = await parseGoalTopics(profile, forceRefresh);

  if (topics.length === 0) {
    log("\n  MY-PROFILE.md에 목표가 없습니다.");
    log("  `kore-chamber profile`로 목표를 먼저 작성하면 갭 분석이 가능합니다.\n");
    return;
  }

  log(`   목표 토픽 ${topics.length}개 추출됨`);

  // 3. Vault coverage (deterministic)
  const mocDir = path.join(vaultPath, "50-MOC");
  const coverages = collectVaultCoverage(topics, summaries, mocDir);

  // 4. Classify (deterministic)
  const items = classifyTopics(coverages);
  const coveredTopics = coverages
    .filter((c) => !items.find((i) => i.topic.id === c.topic.id))
    .map((c) => c.topic.name);

  const missingCount = items.filter((i) => i.type === "missing").length;
  const shallowCount = items.filter((i) => i.type === "shallow").length;
  const fragileCount = items.filter((i) => i.type === "fragile").length;

  log(`   missing=${missingCount} shallow=${shallowCount} fragile=${fragileCount} covered=${coveredTopics.length}`);

  // 5. LLM interpretation (adjacent + observation)
  log("\n🤖 해석 중...\n");

  const { extractGoalsText } = await import("../core/goal-parser.js");
  const goalsText = extractGoalsText(profile);
  const interpretation = await interpretResults(goalsText, items, coveredTopics);

  // ─── JSON output ───
  if (isJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          stats: { total: summaries.length, missing: missingCount, shallow: shallowCount, fragile: fragileCount, covered: coveredTopics.length },
          items: items.map((i) => ({ type: i.type, topic: i.topic.name, priority: i.topic.priority, reason: i.reason, evidence: i.evidence, nextStep: i.nextStep })),
          adjacent: interpretation.adjacent,
          observation: interpretation.observation,
        },
        null,
        2
      )
    );
    return;
  }

  // ─── Console output ───
  log("━━━ 현황 ━━━");
  log(`  볼트 노트: ${summaries.length}개 | 목표 토픽: ${topics.length}개`);
  log(`  커버됨: ${coveredTopics.length}개 | 문제: ${items.length}개`);
  if (coveredTopics.length > 0) log(`  커버된 토픽: ${coveredTopics.join(", ")}`);

  printItems(items, "missing", log);
  printItems(items, "shallow", log);
  printItems(items, "fragile", log);
  printAdjacent(interpretation.adjacent, log);

  log("━━━ 총평 ━━━");
  log(`  ${interpretation.observation}`);
  log("━━━━━━━━━━━━━━━\n");
}
