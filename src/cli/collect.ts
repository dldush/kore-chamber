import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { findLatestJsonl, parseSession, formatConversation } from "../core/jsonl.js";
import {
  getAllSummaries,
  readNote,
  readProfile,
  writeNote,
  getCategoryFolder,
  updateProfileSection,
  type NoteFrontmatter,
} from "../core/vault.js";
import { checkDuplicate, batchDedup } from "../core/dedup.js";
import { generateSlug } from "../core/slug.js";
import { findBestMOC, addToMOC } from "../core/moc.js";
import { searchRelated, addLinks, addBatchLinks } from "../core/linker.js";
import { ensureAuth } from "../llm/claude.js";
import {
  extractKnowledge,
  judgeBorderline,
  mergeNotes,
  type KnowledgeItem,
} from "../llm/extract.js";

// ─── Output types (JSON contract) ───

interface CollectOutput {
  ok: boolean;
  error?: string;
  sessionId: string;
  transcriptPath: string;
  turns: number;
  knowledgeItems: number;
  stored: StoredItem[];
  merged: MergedItem[];
  skipped: SkippedItem[];
  profileUpdatesApplied: ProfileApplied[];
  profileUpdatesPending: ProfilePending[];
  batchLinksAdded: number;
}

interface StoredItem {
  slug: string;
  action: "created";
  folder: string;
  moc: string | null;
  relatedLinksAdded: number;
}

interface MergedItem {
  slug: string;
  action: "merged";
  mergeTarget: string;
  relatedLinksAdded: number;
}

interface SkippedItem {
  title: string;
  reason: string;
  similarNote: string | null;
  similarity: number;
}

interface ProfileApplied {
  dimension: string;
  confidence: "high";
  summary: string;
}

interface ProfilePending {
  id: string;
  dimension: string;
  confidence: "medium";
  summary: string;
}

// ─── Internal plan types ───

interface CollectPlan {
  items: PlannedItem[];
  profileUpdates: PlannedProfileUpdate[];
}

interface PlannedItem {
  item: KnowledgeItem;
  action: "new" | "merge" | "skip";
  slug: string;
  folder: string;
  filePath: string;
  dedupSimilarity: number;
  mergeTarget?: string;
  mocPath: string | null;
  relatedCount: number;
  skipReason?: string;
}

interface PlannedProfileUpdate {
  dimension: string;
  observed: string;
  confidence: string;
  action: "apply" | "suggest" | "ignore";
}

// ─── Parse CLI args ───

interface CollectArgs {
  dryRun: boolean;
  sessionId?: string;
  output: "json" | "markdown";
}

function parseArgs(args: string[]): CollectArgs {
  let dryRun = false;
  let sessionId: string | undefined;
  let output: "json" | "markdown" = "markdown";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--session" && args[i + 1]) sessionId = args[++i];
    if (args[i] === "--output" && args[i + 1]) {
      output = args[++i] === "json" ? "json" : "markdown";
    }
  }

  return { dryRun, sessionId, output };
}

// ─── Main ───

export async function runCollect(args: string[] = []) {
  const { dryRun, sessionId, output } = parseArgs(args);
  const isJson = output === "json";
  const log = isJson ? () => {} : console.log.bind(console);

  try {
    const result = await collect(dryRun, sessionId, log);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(`\n❌ ${message}\n`);
    }
    process.exit(1);
  }
}

async function collect(
  dryRun: boolean,
  sessionId: string | undefined,
  log: (...args: unknown[]) => void
): Promise<CollectOutput> {
  const config = loadConfig();
  const { vaultPath } = config;

  log(`\n🧠 Kore Chamber — collect${dryRun ? " (dry-run)" : ""}\n`);

  // 1. Find and parse JSONL
  log("📜 세션 로그 탐색...");
  const jsonlPath = findLatestJsonl(sessionId);
  log(`   ${path.basename(jsonlPath)}`);

  const turns = parseSession(jsonlPath);
  const userTurns = turns.filter((t) => t.role === "user").length;

  const baseOutput: CollectOutput = {
    ok: true,
    sessionId: sessionId || path.basename(jsonlPath, ".jsonl"),
    transcriptPath: jsonlPath,
    turns: turns.length,
    knowledgeItems: 0,
    stored: [],
    merged: [],
    skipped: [],
    profileUpdatesApplied: [],
    profileUpdatesPending: [],
    batchLinksAdded: 0,
  };

  if (userTurns < 3) {
    log("\n⏭️  대화가 너무 짧습니다 (3턴 미만). 건너뜁니다.\n");
    return baseOutput;
  }
  log(`   ${turns.length}개 메시지 (사용자 ${userTurns}턴)\n`);

  // 2. Load vault state
  const existingSummaries = getAllSummaries(vaultPath);
  const profile = readProfile(vaultPath);
  const conversation = formatConversation(turns);

  // 3. Auth check + LLM extraction
  log("🔐 Claude 인증 확인...");
  ensureAuth();
  log("🤖 지식 추출 중...");
  const extraction = await extractKnowledge(
    conversation,
    profile,
    existingSummaries.map((s) => s.summary).filter(Boolean)
  );

  if (extraction.knowledge_items.length === 0 && extraction.profile_updates.length === 0) {
    log("\n⏭️  추출할 지식이 없습니다.\n");
    return baseOutput;
  }

  baseOutput.knowledgeItems = extraction.knowledge_items.length;
  log(`   ${extraction.knowledge_items.length}개 항목 추출\n`);

  // 4. Batch dedup (within extraction)
  const keepIndices = batchDedup(extraction.knowledge_items.map((i) => i.summary));
  const uniqueItems = keepIndices.map((i) => extraction.knowledge_items[i]);

  // 5. Plan each item
  log("📋 저장 계획 수립...");
  const plan = await buildPlan(uniqueItems, existingSummaries, vaultPath);

  // 6. Plan profile updates
  for (const update of extraction.profile_updates) {
    let action: "apply" | "suggest" | "ignore";
    if (update.confidence === "high") action = "apply";
    else if (update.confidence === "medium") action = "suggest";
    else action = "ignore";

    plan.profileUpdates.push({
      dimension: update.dimension,
      observed: update.observed,
      confidence: update.confidence,
      action,
    });
  }

  // 7. Display plan (markdown only)
  printPlan(plan, log);

  // 8. Execute (unless dry-run)
  if (dryRun) {
    log("🔍 dry-run 모드: 파일 변경 없음.\n");
    return buildOutput(baseOutput, plan, []);
  }

  log("\n✏️  저장 중...\n");
  const execResults = await executePlan(plan, vaultPath, extraction.profile_updates, log);

  log("━━━ Collect 완료 ━━━\n");
  return buildOutput(baseOutput, plan, execResults);
}

// ─── Build Plan ───

async function buildPlan(
  items: KnowledgeItem[],
  existingSummaries: ReturnType<typeof getAllSummaries>,
  vaultPath: string
): Promise<CollectPlan> {
  const plan: CollectPlan = { items: [], profileUpdates: [] };

  for (const item of items) {
    const dedup = checkDuplicate(item.summary, existingSummaries);
    const slug = generateSlug(item.title);
    const folder = getCategoryFolder(item.category);
    const filePath = path.join(vaultPath, folder, `${slug}.md`);
    const mocPath = findBestMOC(vaultPath, item.tags);

    let action: "new" | "merge" | "skip";
    let mergeTarget: string | undefined;
    let skipReason: string | undefined;

    if (dedup.verdict === "new") {
      action = "new";
    } else if (dedup.verdict === "duplicate") {
      action = "skip";
      skipReason = `duplicate (${(dedup.similarity * 100).toFixed(0)}% — ${dedup.similarNote})`;
    } else {
      const existing = existingSummaries.find((s) => s.slug === dedup.similarNote);
      if (existing) {
        const judgment = await judgeBorderline(
          item.summary, item.content, existing.summary, existing.slug
        );
        action = judgment.verdict === "skip" ? "skip" : judgment.verdict;
        if (action === "merge") mergeTarget = existing.path;
        if (action === "skip") skipReason = judgment.reason;
      } else {
        action = "new";
      }
    }

    const related = action !== "skip"
      ? searchRelated(slug, item.tags, item.summary, existingSummaries, mocPath)
      : [];

    plan.items.push({
      item, action, slug, folder, filePath,
      dedupSimilarity: dedup.similarity, mergeTarget, mocPath,
      relatedCount: related.length, skipReason,
    });
  }

  return plan;
}

// ─── Print Plan (markdown) ───

function printPlan(
  plan: CollectPlan,
  log: (...args: unknown[]) => void
) {
  log(`\n━━━ 저장 계획 ━━━\n`);

  for (const p of plan.items) {
    const icon = p.action === "new" ? "📝" : p.action === "merge" ? "🔄" : "⏭️";
    const label =
      p.action === "new" ? "새 노트" :
      p.action === "merge" ? `병합 → ${path.basename(p.mergeTarget || "")}` :
      `건너뜀: ${p.skipReason}`;

    log(`${icon} ${p.item.title}`);
    log(`   ${label}`);
    if (p.action !== "skip") {
      log(`   📁 ${p.folder}/${p.slug}.md`);
      if (p.mocPath) log(`   📋 MOC: ${path.basename(p.mocPath)}`);
      if (p.relatedCount > 0) log(`   🔗 관련 노트: ${p.relatedCount}개`);
    }
    log();
  }

  const applied = plan.profileUpdates.filter((p) => p.action === "apply");
  const suggested = plan.profileUpdates.filter((p) => p.action === "suggest");

  if (applied.length > 0) {
    log(`👤 프로필 자동 업데이트: ${applied.length}개`);
    for (const u of applied) log(`   ✅ [${u.dimension}] ${u.observed}`);
  }
  if (suggested.length > 0) {
    log(`👤 프로필 검토 필요: ${suggested.length}개`);
    for (const u of suggested) log(`   ⚠️  [${u.dimension}] ${u.observed}`);
  }

  log(`━━━━━━━━━━━━━━━`);
}

// ─── Execute Plan ───

interface ExecResult {
  slug: string;
  relatedLinksAdded: number;
}

async function executePlan(
  plan: CollectPlan,
  vaultPath: string,
  profileUpdates: { dimension: string; observed: string; confidence: string }[],
  log: (...args: unknown[]) => void
): Promise<ExecResult[]> {
  const storedNotes: { path: string; slug: string }[] = [];
  const allSummaries = getAllSummaries(vaultPath);
  const results: ExecResult[] = [];

  for (const p of plan.items) {
    if (p.action === "skip") continue;

    if (p.action === "new") {
      const today = new Date().toISOString().split("T")[0];
      const frontmatter: NoteFrontmatter = {
        created: today,
        tags: p.item.tags,
        type: p.item.category,
        summary: p.item.summary,
      };
      const body = `# ${p.slug}\n\n${p.item.content}\n\n## 관련 노트\n`;
      writeNote(p.filePath, frontmatter, body);
      log(`  📝 ${p.folder}/${p.slug}.md`);
    } else if (p.action === "merge" && p.mergeTarget) {
      const existing = readNote(p.mergeTarget);
      if (existing) {
        const merged = await mergeNotes(
          existing.body, existing.frontmatter.summary,
          p.item.content, p.item.summary
        );
        existing.frontmatter.summary = merged.updated_summary;
        writeNote(p.mergeTarget, existing.frontmatter, merged.merged_body);
        log(`  🔄 ${path.basename(p.mergeTarget)} (병합)`);
      }
    }

    if (p.mocPath) addToMOC(p.mocPath, p.slug);

    const related = searchRelated(
      p.slug, p.item.tags, p.item.summary, allSummaries, p.mocPath
    );
    const notePath = p.action === "merge" && p.mergeTarget ? p.mergeTarget : p.filePath;
    const linkedCount = addLinks(notePath, p.slug, related);
    if (linkedCount > 0) log(`  🔗 ${linkedCount}개 링크 추가`);

    storedNotes.push({ path: p.filePath, slug: p.slug });
    results.push({ slug: p.slug, relatedLinksAdded: linkedCount });
  }

  let batchCount = 0;
  if (storedNotes.length > 1) {
    batchCount = addBatchLinks(storedNotes);
    if (batchCount > 0) log(`  🔗 배치 상호 링크 ${batchCount}개`);
  }

  for (const update of profileUpdates) {
    if (update.confidence === "high") {
      updateProfileSection(vaultPath, dimensionToSection(update.dimension), update.observed);
      log(`  👤 프로필 업데이트: [${update.dimension}] ${update.observed}`);
    }
  }

  return results;
}

// ─── Build JSON output ───

function buildOutput(
  base: CollectOutput,
  plan: CollectPlan,
  execResults: ExecResult[]
): CollectOutput {
  const resultMap = new Map(execResults.map((r) => [r.slug, r]));

  for (const p of plan.items) {
    if (p.action === "new") {
      base.stored.push({
        slug: p.slug,
        action: "created",
        folder: p.folder,
        moc: p.mocPath ? path.basename(p.mocPath, ".md") : null,
        relatedLinksAdded: resultMap.get(p.slug)?.relatedLinksAdded ?? 0,
      });
    } else if (p.action === "merge") {
      base.merged.push({
        slug: p.slug,
        action: "merged",
        mergeTarget: p.mergeTarget ? path.basename(p.mergeTarget) : "",
        relatedLinksAdded: resultMap.get(p.slug)?.relatedLinksAdded ?? 0,
      });
    } else {
      base.skipped.push({
        title: p.item.title,
        reason: p.skipReason || "duplicate",
        similarNote: p.mergeTarget ? path.basename(p.mergeTarget) : null,
        similarity: p.dedupSimilarity,
      });
    }
  }

  let batchLinks = 0;
  const activeItems = plan.items.filter((p) => p.action !== "skip");
  if (activeItems.length > 1) {
    batchLinks = (activeItems.length * (activeItems.length - 1)) / 2;
  }
  base.batchLinksAdded = batchLinks;

  for (const u of plan.profileUpdates) {
    if (u.action === "apply") {
      base.profileUpdatesApplied.push({
        dimension: u.dimension,
        confidence: "high",
        summary: u.observed,
      });
    } else if (u.action === "suggest") {
      base.profileUpdatesPending.push({
        id: `upd_${Math.random().toString(36).slice(2, 8)}`,
        dimension: u.dimension,
        confidence: "medium",
        summary: u.observed,
      });
    }
  }

  return base;
}

function dimensionToSection(dimension: string): string {
  switch (dimension) {
    case "knowledge": return "현재 집중 영역";
    case "goal": return "목표";
    case "preference": return "선호/성향";
    default: return "기타";
  }
}
