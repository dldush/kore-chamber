import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { getAllSummaries, readProfile, type NoteSummary } from "../core/vault.js";
import { countMOCLinks, getMOCNotes } from "../core/moc.js";
import { ensureAuth } from "../llm/claude.js";
import { queryLLM } from "../llm/claude.js";
import { runMigrations } from "../core/migrate.js";

// ─── Types ───

interface VaultSnapshot {
  totalNotes: number;
  folders: FolderStat[];
  mocs: MOCStat[];
  profile: string;
}

interface FolderStat {
  name: string;
  label: string;
  count: number;
  noteTitles: string[];
}

interface MOCStat {
  name: string;
  linkCount: number;
  noteNames: string[];
}

interface GapItem {
  topic: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

interface ExploreResult {
  gaps: GapItem[];
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
            description: "Why this matters for the user's goals. Be specific.",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high = directly blocks a stated goal, medium = important gap, low = nice to have",
          },
        },
        required: ["topic", "reason", "priority"],
      },
    },
    observation: {
      type: "string",
      description: "One paragraph: overall assessment of vault coverage and learning trajectory",
    },
  },
  required: ["gaps", "observation"],
};

// ─── Vault scanning ───

function scanVault(vaultPath: string): VaultSnapshot {
  const folders: FolderStat[] = [
    { name: "10-Concepts", label: "개념", count: 0, noteTitles: [] },
    { name: "20-Troubleshooting", label: "트러블슈팅", count: 0, noteTitles: [] },
    { name: "30-Decisions", label: "결정", count: 0, noteTitles: [] },
    { name: "40-Patterns", label: "패턴", count: 0, noteTitles: [] },
    { name: "00-Inbox", label: "미분류", count: 0, noteTitles: [] },
  ];

  for (const folder of folders) {
    const dir = path.join(vaultPath, folder.name);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    folder.count = files.length;
    folder.noteTitles = files.map((f) => f.replace(".md", ""));
  }

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

  const totalNotes = folders.reduce((sum, f) => sum + f.count, 0);
  const profile = readProfile(vaultPath);

  return { totalNotes, folders, mocs, profile };
}

function buildSnapshotText(snapshot: VaultSnapshot): string {
  const lines: string[] = [];

  lines.push("## Vault Summary");
  lines.push(`Total notes: ${snapshot.totalNotes}`);
  lines.push("");

  for (const folder of snapshot.folders) {
    if (folder.count === 0) continue;
    lines.push(`### ${folder.label} (${folder.count})`);
    for (const title of folder.noteTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (snapshot.mocs.length > 0) {
    lines.push("### MOC Coverage");
    for (const moc of snapshot.mocs) {
      lines.push(`- ${moc.name}: ${moc.linkCount} notes`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Prompt ───

function buildExplorePrompt(snapshotText: string, profile: string, focusTopic?: string): string {
  const focusLine = focusTopic
    ? `\nThe user wants to focus on: "${focusTopic}". Prioritize gaps related to this topic.\n`
    : "";

  return `You are a learning gap analyst. Analyze the user's knowledge vault and identify what's missing.

## User Profile
${profile || "(no profile)"}

## Current Vault State
${snapshotText}
${focusLine}
## Instructions
- Look at the user's goals and current level in their profile
- Compare what they have in the vault vs what they need to reach their goals
- Identify 3-5 specific, actionable gaps — not vague categories
- Each gap should explain WHY it matters for their specific goals
- If the vault has < 5 notes, suggest 3 foundational starter topics instead
- Write in the same language as the user profile (Korean if profile is Korean)
- Be specific: "React 서버 컴포넌트와 클라이언트 컴포넌트의 사용 기준" is good, "React 심화" is too vague

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

  log("\n━━━ 사각지대 ━━━");
  const priorityIcon = { high: "🔴", medium: "🟡", low: "🟢" };
  for (const [i, gap] of result.gaps.entries()) {
    log(`  ${i + 1}. ${priorityIcon[gap.priority]} ${gap.topic}`);
    log(`     ${gap.reason}`);
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

  const config = loadConfig();
  const { vaultPath } = config;

  log("\n🔍 Kore Chamber — explore\n");

  log("📊 볼트 스캔 중...");
  const snapshot = scanVault(vaultPath);

  if (snapshot.totalNotes === 0) {
    log("\n  볼트가 비어있습니다. `kore-chamber collect`로 먼저 지식을 수집하세요.\n");
    return;
  }

  log(`   ${snapshot.totalNotes}개 노트, ${snapshot.mocs.length}개 MOC`);
  if (focusTopic) log(`   포커스: ${focusTopic}`);

  ensureAuth();

  log("\n🤖 갭 분석 중...\n");
  const snapshotText = buildSnapshotText(snapshot);
  const prompt = buildExplorePrompt(snapshotText, snapshot.profile, focusTopic);
  const result = await queryLLM<ExploreResult>(prompt, EXPLORE_SCHEMA);

  if (isJson) {
    console.log(JSON.stringify({ ok: true, snapshot: { totalNotes: snapshot.totalNotes, mocs: snapshot.mocs }, ...result }, null, 2));
    return;
  }

  printResult(snapshot, result, log);
}
