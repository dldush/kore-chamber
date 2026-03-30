import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import {
  findAllJsonl,
  formatConversation,
  getJsonlInfoByPath,
  parseSession,
  type JsonlFileInfo,
} from "../core/jsonl.js";
import {
  bumpConfidence,
  getAllSummaries,
  getTypeFolder,
  readNote,
  type NoteFrontmatter,
  writeNote,
} from "../core/vault.js";
import { addBatchLinks, addLinks, searchRelated } from "../core/linker.js";
import { batchDedup, checkDuplicate, type DedupThresholds } from "../core/dedup.js";
import { addToMOC, findBestMOC } from "../core/moc.js";
import { extractKnowledge, judgeBorderline, mergeNotes, type KnowledgeItem } from "../llm/extract.js";
import { generateSlug } from "../core/slug.js";
import { ensureAuth } from "../llm/claude.js";
import { runMigrations } from "../core/migrate.js";
import { getUnprocessedSessions, markProcessed } from "../core/tracker.js";
import { CliError } from "./errors.js";

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

interface BatchCollectSummary {
  totalSessions: number;
  storedNotes: number;
  mergedNotes: number;
  skippedItems: number;
  emptySessions: number;
  dryRun: boolean;
}

interface BatchCollectOutput {
  ok: boolean;
  sessions: CollectOutput[];
  summary: BatchCollectSummary;
}

interface CollectPlan {
  items: PlannedItem[];
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

interface PersistedNoteRef {
  path: string;
  slug: string;
}

interface ExecResult {
  slug: string;
  relatedLinksAdded: number;
}

interface CollectArgs {
  dryRun: boolean;
  sessionId?: string;
  transcriptPath?: string;
  projectDir?: string;
  output: "json" | "markdown";
  allUnprocessed: boolean;
}

interface CollectSessionOptions {
  dryRun: boolean;
  log: (...args: unknown[]) => void;
  showBanner?: boolean;
}

export async function runCollect(args: string[] = []) {
  runMigrations();

  const { dryRun, sessionId, transcriptPath, projectDir, output, allUnprocessed } = parseArgs(args);
  const isJson = output === "json";
  const log = isJson ? () => {} : console.log.bind(console);

  try {
    if (allUnprocessed) {
      const targets = getUnprocessedSessions(findAllJsonl());
      if (targets.length === 0) {
        emitNoSessions(isJson, "미처리 세션이 없습니다.");
        return;
      }

      log(`\n📥 미처리 세션 ${targets.length}개 발견`);
      log(`   ${dryRun ? "dry-run 모드입니다." : "LLM API 토큰이 사용됩니다."}`);
      log(`   예상 시간: ~${estimateTime(targets.length)}\n`);

      const results = await collectBatch(targets, { dryRun, log });
      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      }
      return;
    }

    const target = resolveSingleTarget({ sessionId, transcriptPath, projectDir });

    if (!target) {
      emitNoSessions(isJson, sessionId
        ? `세션 ${sessionId}에 해당하는 JSONL 파일을 찾을 수 없습니다.`
        : "미처리 세션이 없습니다.");
      return;
    }

    const result = await collectSession(target, { dryRun, log, showBanner: true });
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      throw new CliError("", { handled: true });
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

function resolveSingleTarget(args: {
  sessionId?: string;
  transcriptPath?: string;
  projectDir?: string;
}): JsonlFileInfo | null {
  if (args.transcriptPath) {
    return getJsonlInfoByPath(args.transcriptPath, args.projectDir);
  }

  const target = args.sessionId
    ? findAllJsonl(args.sessionId)[0]
    : getUnprocessedSessions(findAllJsonl())[0];

  return target ?? null;
}

function parseArgs(args: string[]): CollectArgs {
  let dryRun = false;
  let sessionId: string | undefined;
  let transcriptPath: string | undefined;
  let projectDir: string | undefined;
  let output: "json" | "markdown" = "markdown";
  let allUnprocessed = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--all") allUnprocessed = true;
    if (args[i] === "--session" && args[i + 1]) sessionId = args[++i];
    if (args[i] === "--transcript-path" && args[i + 1]) transcriptPath = args[++i];
    if (args[i] === "--project-dir" && args[i + 1]) projectDir = args[++i];
    if (args[i] === "--output" && args[i + 1]) {
      output = args[++i] === "json" ? "json" : "markdown";
    }
  }

  if (allUnprocessed && sessionId) {
    throw new Error("--all과 --session은 함께 사용할 수 없습니다.");
  }

  if (allUnprocessed && transcriptPath) {
    throw new Error("--all과 --transcript-path는 함께 사용할 수 없습니다.");
  }

  if (sessionId && transcriptPath) {
    throw new Error("--session과 --transcript-path는 함께 사용할 수 없습니다.");
  }

  return { dryRun, sessionId, transcriptPath, projectDir, output, allUnprocessed };
}

async function collectBatch(
  targets: JsonlFileInfo[],
  options: { dryRun: boolean; log: (...args: unknown[]) => void }
): Promise<BatchCollectOutput> {
  const results: CollectOutput[] = [];

  for (const [index, target] of targets.entries()) {
    options.log(`[${index + 1}/${targets.length}] ${target.projectPath}/${path.basename(target.path)}`);
    const nestedLog = createPrefixedLogger(options.log, "   ");
    const result = await collectSession(target, {
      dryRun: options.dryRun,
      log: nestedLog,
      showBanner: false,
    });
    results.push(result);
    options.log("");
  }

  const summary = buildBatchSummary(results, options.dryRun);
  options.log("━━━ Collect 완료 ━━━");
  options.log(`  처리: ${summary.totalSessions}개 세션`);
  options.log(`  저장: ${summary.storedNotes}개 노트`);
  options.log(`  병합: ${summary.mergedNotes}개`);
  options.log(`  중복/건너뜀: ${summary.skippedItems}개`);
  options.log(`  빈 결과: ${summary.emptySessions}개 세션`);
  options.log("━━━━━━━━━━━━━━━\n");

  return {
    ok: true,
    sessions: results,
    summary,
  };
}

async function collectSession(
  target: JsonlFileInfo,
  options: CollectSessionOptions
): Promise<CollectOutput> {
  const config = loadConfig();
  const { vaultPath, dedup: dedupThresholds } = config;

  if (options.showBanner !== false) {
    options.log(`\n🧠 Kore Chamber — collect${options.dryRun ? " (dry-run)" : ""}\n`);
  }

  options.log("📜 세션 로그 탐색...");
  options.log(`   ${path.basename(target.path)}`);

  const turns = parseSession(target.path);
  const userTurns = turns.filter((turn) => turn.role === "user").length;

  const baseOutput: CollectOutput = {
    ok: true,
    sessionId: target.sessionId,
    transcriptPath: target.path,
    turns: turns.length,
    knowledgeItems: 0,
    stored: [],
    merged: [],
    skipped: [],
    batchLinksAdded: 0,
  };

  if (userTurns < 3) {
    options.log("\n⏭️  대화가 너무 짧습니다 (3턴 미만). 건너뜁니다.");
    maybeMarkProcessed(options.dryRun, target, 0);
    return baseOutput;
  }
  options.log(`   ${turns.length}개 메시지 (사용자 ${userTurns}턴)\n`);

  const existingSummaries = getAllSummaries(vaultPath);
  const conversation = formatConversation(turns);

  ensureAuth();
  options.log("🤖 지식 추출 중...");
  const extraction = await extractKnowledge(
    conversation,
    existingSummaries.map((summary) => summary.summary).filter(Boolean)
  );

  if (extraction.knowledge_items.length === 0) {
    options.log("\n⏭️  추출할 지식이 없습니다.");
    maybeMarkProcessed(options.dryRun, target, 0);
    return baseOutput;
  }

  baseOutput.knowledgeItems = extraction.knowledge_items.length;
  options.log(`   ${extraction.knowledge_items.length}개 항목 추출\n`);

  const keepIndices = batchDedup(
    extraction.knowledge_items.map((item) => item.summary),
    dedupThresholds
  );
  const uniqueItems = keepIndices.map((index) => extraction.knowledge_items[index]);

  options.log("📋 저장 계획 수립...");
  const plan = await buildPlan(uniqueItems, existingSummaries, vaultPath, dedupThresholds);
  printPlan(plan, options.log);

  if (options.dryRun) {
    options.log("🔍 dry-run 모드: 파일 변경 없음.\n");
    return buildOutput(baseOutput, plan, [], 0);
  }

  options.log("\n✏️  저장 중...\n");
  const { results: execResults, batchLinksAdded } = await executePlan(plan, vaultPath, options.log);
  const output = buildOutput(baseOutput, plan, execResults, batchLinksAdded);
  maybeMarkProcessed(false, target, output.stored.length);

  options.log("━━━ Collect 완료 ━━━\n");
  return output;
}

async function buildPlan(
  items: KnowledgeItem[],
  existingSummaries: ReturnType<typeof getAllSummaries>,
  vaultPath: string,
  thresholds: DedupThresholds
): Promise<CollectPlan> {
  const plan: CollectPlan = { items: [] };

  for (const item of items) {
    const dedup = checkDuplicate(item.summary, existingSummaries, thresholds);
    const slug = generateSlug(item.title);
    const folder = getTypeFolder(item.type);
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
      const existing = existingSummaries.find((summary) => summary.slug === dedup.similarNote);
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

    const persisted = getPersistedNoteRef({ action, mergeTarget, filePath, slug });
    const related = action !== "skip"
      ? searchRelated(persisted.slug, item.tags, item.summary, existingSummaries, mocPath)
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

  return plan;
}

function printPlan(
  plan: CollectPlan,
  log: (...args: unknown[]) => void
) {
  log("\n━━━ 저장 계획 ━━━\n");

  for (const planned of plan.items) {
    const icon = planned.action === "new" ? "📝" : planned.action === "merge" ? "🔄" : "⏭️";
    const label = planned.action === "new"
      ? "새 노트"
      : planned.action === "merge"
        ? `병합 → ${path.basename(planned.mergeTarget || "")}`
        : `건너뜀: ${planned.skipReason}`;

    log(`${icon} ${planned.item.title}`);
    log(`   ${label}`);
    if (planned.action !== "skip") {
      log(`   📁 ${planned.folder}/${planned.slug}.md`);
      if (planned.mocPath) log(`   📋 MOC: ${path.basename(planned.mocPath)}`);
      if (planned.relatedCount > 0) log(`   🔗 관련 노트: ${planned.relatedCount}개`);
    }
    log("");
  }

  log("━━━━━━━━━━━━━━━");
}

async function executePlan(
  plan: CollectPlan,
  vaultPath: string,
  log: (...args: unknown[]) => void
): Promise<{ results: ExecResult[]; batchLinksAdded: number }> {
  const storedNotes: PersistedNoteRef[] = [];
  const allSummaries = getAllSummaries(vaultPath);
  const results: ExecResult[] = [];

  for (const planned of plan.items) {
    if (planned.action === "skip") continue;

    const persisted = getPersistedNoteRef(planned);

    if (planned.action === "new") {
      const today = new Date().toISOString().split("T")[0];
      const frontmatter: NoteFrontmatter = {
        title: planned.item.title,
        created: today,
        tags: planned.item.tags,
        type: planned.item.type,
        summary: planned.item.summary,
        confidence: 0.5,
      };
      const body = `# ${planned.slug}\n\n${planned.item.content}\n\n## 관련 노트\n`;
      writeNote(planned.filePath, frontmatter, body);
      log(`  📝 ${planned.folder}/${planned.slug}.md`);
    } else if (planned.action === "merge" && planned.mergeTarget) {
      const existing = readNote(persisted.path);
      if (existing) {
        const merged = await mergeNotes(
          existing.body,
          existing.frontmatter.summary,
          planned.item.content,
          planned.item.summary
        );
        existing.frontmatter.summary = merged.updated_summary;
        writeNote(persisted.path, existing.frontmatter, merged.merged_body);
        bumpConfidence(persisted.path);
        log(`  🔄 ${path.basename(persisted.path)} (병합, confidence +0.1)`);
      }
    }

    if (planned.mocPath) addToMOC(planned.mocPath, persisted.slug);

    const related = searchRelated(
      persisted.slug,
      planned.item.tags,
      planned.item.summary,
      allSummaries,
      planned.mocPath
    );
    const linkedCount = addLinks(persisted.path, persisted.slug, related);
    if (linkedCount > 0) log(`  🔗 ${linkedCount}개 링크 추가`);

    storedNotes.push(persisted);
    results.push({ slug: planned.slug, relatedLinksAdded: linkedCount });
  }

  const uniqueStoredNotes = dedupePersistedNotes(storedNotes);
  let batchCount = 0;
  if (uniqueStoredNotes.length > 1) {
    batchCount = addBatchLinks(uniqueStoredNotes);
    if (batchCount > 0) log(`  🔗 배치 상호 링크 ${batchCount}개`);
  }

  return { results, batchLinksAdded: batchCount };
}

function buildOutput(
  base: CollectOutput,
  plan: CollectPlan,
  execResults: ExecResult[],
  batchLinksAdded: number
): CollectOutput {
  const resultMap = new Map(execResults.map((result) => [result.slug, result]));

  for (const planned of plan.items) {
    if (planned.action === "new") {
      base.stored.push({
        slug: planned.slug,
        action: "created",
        folder: planned.folder,
        moc: planned.mocPath ? path.basename(planned.mocPath, ".md") : null,
        relatedLinksAdded: resultMap.get(planned.slug)?.relatedLinksAdded ?? 0,
      });
    } else if (planned.action === "merge") {
      base.merged.push({
        slug: planned.slug,
        action: "merged",
        mergeTarget: planned.mergeTarget ? path.basename(planned.mergeTarget) : "",
        relatedLinksAdded: resultMap.get(planned.slug)?.relatedLinksAdded ?? 0,
      });
    } else {
      base.skipped.push({
        title: planned.item.title,
        reason: planned.skipReason || "duplicate",
        similarNote: planned.mergeTarget ? path.basename(planned.mergeTarget) : null,
        similarity: planned.dedupSimilarity,
      });
    }
  }

  base.batchLinksAdded = batchLinksAdded;
  return base;
}

function buildBatchSummary(
  results: CollectOutput[],
  dryRun: boolean
): BatchCollectSummary {
  return {
    totalSessions: results.length,
    storedNotes: results.reduce((sum, result) => sum + result.stored.length, 0),
    mergedNotes: results.reduce((sum, result) => sum + result.merged.length, 0),
    skippedItems: results.reduce((sum, result) => sum + result.skipped.length, 0),
    emptySessions: results.filter(
      (result) =>
        result.knowledgeItems === 0
        && result.stored.length === 0
        && result.merged.length === 0
        && result.skipped.length === 0
    ).length,
    dryRun,
  };
}

function maybeMarkProcessed(
  dryRun: boolean,
  target: JsonlFileInfo,
  notesCreated: number
) {
  if (dryRun) return;
  markProcessed(target.sessionId, target.path, notesCreated);
}

const SECONDS_PER_SESSION = 15;

function estimateTime(sessionCount: number): string {
  const totalSeconds = sessionCount * SECONDS_PER_SESSION;
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.ceil(totalSeconds / 60);
  return `${minutes}분`;
}

function emitNoSessions(isJson: boolean, message: string) {
  if (isJson) {
    console.log(JSON.stringify({ ok: true, message }, null, 2));
    return;
  }
  console.log(`\n⏭️  ${message}\n`);
}

function getPersistedNoteRef(
  item: Pick<PlannedItem, "action" | "mergeTarget" | "filePath" | "slug">
): PersistedNoteRef {
  if (item.action === "merge" && item.mergeTarget) {
    return {
      path: item.mergeTarget,
      slug: path.basename(item.mergeTarget, ".md"),
    };
  }

  return {
    path: item.filePath,
    slug: item.slug,
  };
}

function dedupePersistedNotes(notes: PersistedNoteRef[]): PersistedNoteRef[] {
  const unique = new Map<string, PersistedNoteRef>();

  for (const note of notes) {
    unique.set(note.path, note);
  }

  return [...unique.values()];
}

function createPrefixedLogger(
  log: (...args: unknown[]) => void,
  prefix: string
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    for (const arg of args) {
      const text = String(arg);
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        log(`${prefix}${line}`);
      }
    }
  };
}
