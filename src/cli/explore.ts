import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { getAllSummaries, readNote, readProfile, type NoteSummary } from "../core/vault.js";
import { countMOCLinks, getMOCNotes } from "../core/moc.js";
import { ensureAuth, queryLLM } from "../llm/claude.js";
import { runMigrations } from "../core/migrate.js";

// ─── Types ───

interface VaultSnapshot {
  totalNotes: number;
  folders: FolderStat[];
  mocs: MOCStat[];
  profile: string;
  goals: string;
  summaries: NoteSummary[];
  lowConfidenceNotes: LowConfidenceNote[];
}

interface FolderStat {
  name: string;
  label: string;
  count: number;
}

interface MOCStat {
  name: string;
  linkCount: number;
  noteNames: string[];
}

interface LowConfidenceNote {
  slug: string;
  summary: string;
  type: string;
  confidence: number;
}

interface GapItem {
  topic: string;
  reason: string;
  priority: "high" | "medium" | "low";
  next_question: string;
}

interface ExploreResult {
  gaps: GapItem[];
  shaky_ground: string[];
  observation: string;
}

const EXPLORE_SCHEMA = {
  type: "object",
  properties: {
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Missing topic or area" },
          reason: {
            type: "string",
            description: "Why this gap blocks the user's stated goals. Be specific to their profile.",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high = directly blocks a stated goal, medium = important foundation gap, low = would be useful",
          },
          next_question: {
            type: "string",
            description: "One concrete question the user should be able to answer once this gap is filled. Make it specific and testable.",
          },
        },
        required: ["topic", "reason", "priority", "next_question"],
      },
    },
    shaky_ground: {
      type: "array",
      items: { type: "string" },
      description: "Slugs from the low-confidence note list that appear to be misunderstood or only superficially covered. Max 3.",
    },
    observation: {
      type: "string",
      description: "One paragraph: overall assessment of learning trajectory and vault coverage relative to stated goals.",
    },
  },
  required: ["gaps", "shaky_ground", "observation"],
};

// ─── Vault scanning ───

function scanVault(vaultPath: string): VaultSnapshot {
  const folderDefs: Array<{ name: string; label: string }> = [
    { name: "10-Concepts", label: "개념" },
    { name: "20-Troubleshooting", label: "트러블슈팅" },
    { name: "30-Decisions", label: "결정" },
    { name: "40-Patterns", label: "패턴" },
    { name: "00-Inbox", label: "미분류" },
  ];

  const folders: FolderStat[] = folderDefs.map(({ name, label }) => {
    const dir = path.join(vaultPath, name);
    if (!fs.existsSync(dir)) return { name, label, count: 0 };
    const count = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).length;
    return { name, label, count };
  });

  const mocs: MOCStat[] = [];
  const mocDir = path.join(vaultPath, "50-MOC");
  if (fs.existsSync(mocDir)) {
    for (const file of fs.readdirSync(mocDir)) {
      if (!file.startsWith("MOC-") || !file.endsWith(".md")) continue;
      const mocPath = path.join(mocDir, file);
      mocs.push({
        name: file.replace("MOC-", "").replace(".md", ""),
        linkCount: countMOCLinks(mocPath),
        noteNames: getMOCNotes(mocPath),
      });
    }
  }

  const summaries = getAllSummaries(vaultPath);
  const totalNotes = summaries.length;

  const lowConfidenceNotes: LowConfidenceNote[] = summaries
    .filter((s) => s.confidence < 0.5 && s.summary.length > 0)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 10)
    .map((s) => ({
      slug: s.slug,
      summary: s.summary,
      type: s.type,
      confidence: s.confidence,
    }));

  const profile = readProfile(vaultPath);
  const goals = extractGoals(profile);

  return { totalNotes, folders, mocs, profile, goals, summaries, lowConfidenceNotes };
}

function extractGoals(profile: string): string {
  const goalMatch = profile.match(/## 목표\n([\s\S]*?)(?=\n## |$)/);
  const interestMatch = profile.match(/## 깊이 파고 싶은 영역\n([\s\S]*?)(?=\n## |$)/);

  const parts: string[] = [];
  if (goalMatch?.[1]?.trim()) parts.push(`목표: ${goalMatch[1].trim()}`);
  if (interestMatch?.[1]?.trim()) parts.push(`집중 관심사: ${interestMatch[1].trim()}`);

  return parts.join("\n");
}

function buildSnapshotText(snapshot: VaultSnapshot): string {
  const lines: string[] = [];

  lines.push("## Vault Summary");
  lines.push(`Total notes: ${snapshot.totalNotes}`);
  lines.push("");

  for (const folder of snapshot.folders) {
    if (folder.count === 0) continue;
    lines.push(`${folder.label}: ${folder.count}개`);
  }
  lines.push("");

  if (snapshot.summaries.length > 0) {
    lines.push("## Notes (slug | type | confidence | summary | tags)");
    for (const s of snapshot.summaries) {
      const tags = s.tags.length > 0 ? s.tags.join(", ") : "-";
      lines.push(`- ${s.slug} | ${s.type} | ${s.confidence.toFixed(1)} | ${s.summary} | [${tags}]`);
    }
    lines.push("");
  }

  if (snapshot.lowConfidenceNotes.length > 0) {
    lines.push("## Low-Confidence Notes (possible shaky ground)");
    lines.push("These notes have low confidence scores — the user may have only surface-level understanding:");
    for (const n of snapshot.lowConfidenceNotes) {
      lines.push(`- ${n.slug} (${n.confidence.toFixed(1)}): ${n.summary}`);
    }
    lines.push("");
  }

  if (snapshot.mocs.length > 0) {
    lines.push("## MOC Coverage");
    for (const moc of snapshot.mocs) {
      lines.push(`- ${moc.name}: ${moc.linkCount} notes`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Prompt ───

function buildExplorePrompt(snapshotText: string, profile: string, goals: string, focusTopic?: string): string {
  const focusLine = focusTopic
    ? `\nThe user wants to focus on: "${focusTopic}". Prioritize gaps related to this topic.\n`
    : "";

  const goalsSection = goals
    ? `## User Goals (prioritize gaps that block these)\n${goals}\n`
    : "";

  return `You are a learning gap analyst. Your job is to find what the user doesn't know they don't know.

## User Profile
${profile || "(no profile)"}

${goalsSection}
## Current Vault State
${snapshotText}
${focusLine}
## Instructions
- Cross-reference the user's stated goals against what's in the vault
- Identify 3-5 specific, actionable gaps — not vague categories
- Each gap must explain WHY it blocks the user's specific goals
- For next_question: write a concrete, testable question. If the user can answer it, the gap is closed. Bad: "React 이해하기". Good: "React에서 useEffect의 cleanup 함수가 실행되는 시점은 언제이고, 왜 필요한가?"
- For shaky_ground: from the low-confidence note list, pick up to 3 that seem most likely to be misunderstood based on the summary. Return their slugs.
- If the vault has < 5 notes, suggest 3 foundational starter topics instead
- Write in the same language as the user profile (Korean if profile is Korean)
- Be specific. Vague gaps like "React 심화" are not acceptable.

Respond as JSON.`;
}

// ─── Output ───

function printResult(snapshot: VaultSnapshot, result: ExploreResult, log: (...args: unknown[]) => void) {
  log("\n━━━ 현황 ━━━");
  for (const folder of snapshot.folders) {
    if (folder.count === 0) continue;
    log(`  ${folder.label}: ${folder.count}개`);
  }
  if (snapshot.mocs.length > 0) {
    const mocSummary = snapshot.mocs
      .sort((a, b) => b.linkCount - a.linkCount)
      .map((m) => `${m.name}(${m.linkCount})`)
      .join(", ");
    log(`  MOC: ${mocSummary}`);
  }

  log("\n━━━ 지식 사각지대 ━━━");
  const priorityIcon = { high: "🔴", medium: "🟡", low: "🟢" };
  for (const [i, gap] of result.gaps.entries()) {
    log(`  ${i + 1}. ${priorityIcon[gap.priority]} ${gap.topic}`);
    log(`     ${gap.reason}`);
    log(`     → ${gap.next_question}`);
  }

  if (result.shaky_ground.length > 0) {
    log("\n━━━ 흔들리는 땅 ━━━");
    log("  알고 있다고 생각하지만 실제로는 표면적 이해에 그칠 수 있는 개념:");
    for (const slug of result.shaky_ground) {
      const note = snapshot.summaries.find((s) => s.slug === slug);
      const summary = note ? ` — ${note.summary}` : "";
      log(`  • ${slug}${summary}`);
    }
  }

  log(`\n━━━ 총평 ━━━`);
  log(`  ${result.observation}`);
  log("━━━━━━━━━━━━━━━\n");
}

// ─── Main ───

export async function runExplore(args: string[] = []) {
  runMigrations();

  const focusTopic = args.filter((a) => !a.startsWith("--")).join(" ") || undefined;
  const isJson = args.includes("--output") && args[args.indexOf("--output") + 1] === "json";
  const log = isJson ? () => {} : console.log.bind(console);

  const { vaultPath } = loadConfig();

  log("\n🔍 Kore Chamber — explore\n");

  log("📊 볼트 스캔 중...");
  const snapshot = scanVault(vaultPath);

  if (snapshot.totalNotes === 0) {
    log("\n  볼트가 비어있습니다. `kore-chamber collect`로 먼저 지식을 수집하세요.\n");
    return;
  }

  log(`   ${snapshot.totalNotes}개 노트, ${snapshot.mocs.length}개 MOC, low-confidence ${snapshot.lowConfidenceNotes.length}개`);
  if (focusTopic) log(`   포커스: ${focusTopic}`);

  ensureAuth();

  log("\n🤖 갭 분석 중...\n");
  const snapshotText = buildSnapshotText(snapshot);
  const prompt = buildExplorePrompt(snapshotText, snapshot.profile, snapshot.goals, focusTopic);
  const result = await queryLLM<ExploreResult>(prompt, EXPLORE_SCHEMA);

  if (isJson) {
    console.log(JSON.stringify({
      ok: true,
      snapshot: { totalNotes: snapshot.totalNotes, mocs: snapshot.mocs, lowConfidenceCount: snapshot.lowConfidenceNotes.length },
      ...result,
    }, null, 2));
    return;
  }

  printResult(snapshot, result, log);
}
