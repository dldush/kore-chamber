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
import {
  extractKnowledge,
  judgeBorderline,
  mergeNotes,
  type KnowledgeItem,
} from "../llm/extract.js";

// ─── Types ───

interface CollectPlan {
  items: PlannedItem[];
  profileUpdates: PlannedProfileUpdate[];
  batchLinks: number;
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

function parseArgs(args: string[]): { dryRun: boolean; sessionId?: string } {
  let dryRun = false;
  let sessionId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--session" && args[i + 1]) sessionId = args[++i];
  }

  return { dryRun, sessionId };
}

// ─── Main ───

export async function runCollect(args: string[] = []) {
  const { dryRun, sessionId } = parseArgs(args);
  const config = loadConfig();
  const { vaultPath } = config;

  console.log(`\n🧠 Kore Chamber — collect${dryRun ? " (dry-run)" : ""}\n`);

  // 1. Find and parse JSONL
  console.log("📜 세션 로그 탐색...");
  const jsonlPath = findLatestJsonl(sessionId);
  console.log(`   ${path.basename(jsonlPath)}`);

  const turns = parseSession(jsonlPath);
  const userTurns = turns.filter((t) => t.role === "user").length;

  if (userTurns < 3) {
    console.log("\n⏭️  대화가 너무 짧습니다 (3턴 미만). 건너뜁니다.\n");
    return;
  }
  console.log(`   ${turns.length}개 메시지 (사용자 ${userTurns}턴)\n`);

  // 2. Load vault state
  const existingSummaries = getAllSummaries(vaultPath);
  const profile = readProfile(vaultPath);
  const conversation = formatConversation(turns);

  // 3. LLM extraction
  console.log("🤖 지식 추출 중...");
  const extraction = await extractKnowledge(
    conversation,
    profile,
    existingSummaries.map((s) => s.summary).filter(Boolean)
  );

  if (extraction.knowledge_items.length === 0 && extraction.profile_updates.length === 0) {
    console.log("\n⏭️  추출할 지식이 없습니다.\n");
    return;
  }
  console.log(`   ${extraction.knowledge_items.length}개 항목 추출\n`);

  // 4. Batch dedup (within extraction)
  const keepIndices = batchDedup(
    extraction.knowledge_items.map((i) => i.summary)
  );
  const uniqueItems = keepIndices.map((i) => extraction.knowledge_items[i]);
  const batchDupes = extraction.knowledge_items.length - uniqueItems.length;
  if (batchDupes > 0) {
    console.log(`   배치 내 중복 ${batchDupes}개 제거\n`);
  }

  // 5. Plan each item
  console.log("📋 저장 계획 수립...");
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

  // 7. Display plan
  printPlan(plan);

  // 8. Execute (unless dry-run)
  if (dryRun) {
    console.log("🔍 dry-run 모드: 파일 변경 없음.\n");
    return;
  }

  console.log("\n✏️  저장 중...\n");
  await executePlan(plan, vaultPath, extraction.profile_updates);

  console.log("━━━ Collect 완료 ━━━\n");
}

// ─── Build Plan ───

async function buildPlan(
  items: KnowledgeItem[],
  existingSummaries: ReturnType<typeof getAllSummaries>,
  vaultPath: string
): Promise<CollectPlan> {
  const plan: CollectPlan = { items: [], profileUpdates: [], batchLinks: 0 };

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
      skipReason = `중복 (${(dedup.similarity * 100).toFixed(0)}% — ${dedup.similarNote})`;
    } else {
      // Borderline → AI judgment
      const existing = existingSummaries.find((s) => s.slug === dedup.similarNote);
      if (existing) {
        const judgment = await judgeBorderline(
          item.summary,
          item.content,
          existing.summary,
          existing.slug
        );
        action = judgment.verdict === "skip" ? "skip" : judgment.verdict;
        if (action === "merge") mergeTarget = existing.path;
        if (action === "skip") skipReason = judgment.reason;
      } else {
        action = "new";
      }
    }

    // Count related notes (for display)
    const related = action !== "skip"
      ? searchRelated(slug, item.tags, item.summary, existingSummaries, mocPath)
      : [];

    plan.items.push({
      item,
      action,
      slug,
      folder,
      filePath,
      dedupSimilarity: dedup.similarity,
      mergeTarget,
      mocPath,
      relatedCount: related.length,
      skipReason,
    });
  }

  // Count batch links
  const newItems = plan.items.filter((p) => p.action !== "skip");
  plan.batchLinks = newItems.length > 1 ? (newItems.length * (newItems.length - 1)) / 2 : 0;

  return plan;
}

// ─── Print Plan ───

function printPlan(plan: CollectPlan) {
  const newCount = plan.items.filter((p) => p.action === "new").length;
  const mergeCount = plan.items.filter((p) => p.action === "merge").length;
  const skipCount = plan.items.filter((p) => p.action === "skip").length;

  console.log(`\n━━━ 저장 계획 ━━━\n`);

  for (const p of plan.items) {
    const icon = p.action === "new" ? "📝" : p.action === "merge" ? "🔄" : "⏭️";
    const actionLabel =
      p.action === "new" ? "새 노트" :
      p.action === "merge" ? `병합 → ${path.basename(p.mergeTarget || "")}` :
      `건너뜀: ${p.skipReason}`;

    console.log(`${icon} ${p.item.title}`);
    console.log(`   ${actionLabel}`);
    if (p.action !== "skip") {
      console.log(`   📁 ${p.folder}/${p.slug}.md`);
      if (p.mocPath) console.log(`   📋 MOC: ${path.basename(p.mocPath)}`);
      if (p.relatedCount > 0) console.log(`   🔗 관련 노트: ${p.relatedCount}개`);
    }
    console.log();
  }

  if (plan.batchLinks > 0) {
    console.log(`🔗 배치 상호 링크: ${plan.batchLinks}개`);
  }

  console.log(`\n📊 요약: ${newCount}개 생성, ${mergeCount}개 병합, ${skipCount}개 건너뜀`);

  // Profile updates
  const applied = plan.profileUpdates.filter((p) => p.action === "apply");
  const suggested = plan.profileUpdates.filter((p) => p.action === "suggest");

  if (applied.length > 0) {
    console.log(`\n👤 프로필 자동 업데이트: ${applied.length}개`);
    for (const u of applied) console.log(`   ✅ [${u.dimension}] ${u.observed}`);
  }
  if (suggested.length > 0) {
    console.log(`\n👤 프로필 검토 필요: ${suggested.length}개`);
    for (const u of suggested) console.log(`   ⚠️  [${u.dimension}] ${u.observed}`);
  }

  console.log(`\n━━━━━━━━━━━━━━━`);
}

// ─── Execute Plan ───

async function executePlan(
  plan: CollectPlan,
  vaultPath: string,
  profileUpdates: { dimension: string; observed: string; confidence: string }[]
) {
  const storedNotes: { path: string; slug: string }[] = [];
  const allSummaries = getAllSummaries(vaultPath);

  for (const p of plan.items) {
    if (p.action === "skip") continue;

    if (p.action === "new") {
      // Create new note
      const today = new Date().toISOString().split("T")[0];
      const frontmatter: NoteFrontmatter = {
        created: today,
        tags: p.item.tags,
        type: p.item.category,
        summary: p.item.summary,
      };

      const body = `# ${p.slug}\n\n${p.item.content}\n\n## 관련 노트\n`;
      writeNote(p.filePath, frontmatter, body);
      console.log(`  📝 ${p.folder}/${p.slug}.md`);
    } else if (p.action === "merge" && p.mergeTarget) {
      // AI-assisted merge
      const existing = readNote(p.mergeTarget);
      if (existing) {
        const merged = await mergeNotes(
          existing.body,
          existing.frontmatter.summary,
          p.item.content,
          p.item.summary
        );
        existing.frontmatter.summary = merged.updated_summary;
        writeNote(p.mergeTarget, existing.frontmatter, merged.merged_body);
        console.log(`  🔄 ${path.basename(p.mergeTarget)} (병합)`);
      }
    }

    // MOC link
    if (p.mocPath) {
      addToMOC(p.mocPath, p.slug);
    }

    // Related note links
    const related = searchRelated(
      p.slug, p.item.tags, p.item.summary, allSummaries, p.mocPath
    );
    const linkedCount = addLinks(
      p.action === "merge" && p.mergeTarget ? p.mergeTarget : p.filePath,
      p.slug,
      related
    );
    if (linkedCount > 0) console.log(`  🔗 ${linkedCount}개 링크 추가`);

    storedNotes.push({ path: p.filePath, slug: p.slug });
  }

  // Batch links (Hebbian)
  if (storedNotes.length > 1) {
    const batchCount = addBatchLinks(storedNotes);
    if (batchCount > 0) console.log(`  🔗 배치 상호 링크 ${batchCount}개`);
  }

  // Profile updates (high confidence only)
  for (const update of profileUpdates) {
    if (update.confidence === "high") {
      updateProfileSection(vaultPath, dimensionToSection(update.dimension), update.observed);
      console.log(`  👤 프로필 업데이트: [${update.dimension}] ${update.observed}`);
    }
  }
}

function dimensionToSection(dimension: string): string {
  switch (dimension) {
    case "knowledge": return "현재 집중 영역";
    case "goal": return "목표";
    case "preference": return "선호/성향";
    default: return "기타";
  }
}
