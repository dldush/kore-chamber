import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { getAllSummaries, getFreshness, readNote, readProfile, type Freshness, type NoteType, type NoteSummary } from "../core/vault.js";
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
  tagDistribution: TagFreq[];
  shakeyGroundCandidates: ShakeyCandidate[];
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

interface TagFreq {
  tag: string;
  count: number;
}

interface ShakeyCandidate {
  slug: string;
  summary: string;
  type: NoteType;
  confidence: number;
  freshness: Freshness;
  isolated: boolean;
  signal: "never_reinforced_and_stale" | "never_reinforced_and_isolated" | "reinforced_but_stale";
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
            description: "One concrete, testable question. If the user can answer it fluently, the gap is closed.",
          },
        },
        required: ["topic", "reason", "priority", "next_question"],
      },
    },
    shaky_ground: {
      type: "array",
      items: { type: "string" },
      description: "Slugs from the shaky-ground candidate list whose summary suggests the user only has surface-level understanding. Max 3. Only pick ones where deeper knowledge is actually needed for their goals.",
    },
    observation: {
      type: "string",
      description: "One paragraph: overall assessment of learning trajectory, tag coverage relative to stated goals, and what to prioritize next.",
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
  const tagDistribution = buildTagDistribution(summaries);
  const shakeyGroundCandidates = findShakeyGroundCandidates(summaries, vaultPath);
  const profile = readProfile(vaultPath);
  const goals = extractGoals(profile);

  return {
    totalNotes: summaries.length,
    folders,
    mocs,
    profile,
    goals,
    summaries,
    tagDistribution,
    shakeyGroundCandidates,
  };
}

function buildTagDistribution(summaries: NoteSummary[]): TagFreq[] {
  const freq = new Map<string, number>();
  for (const s of summaries) {
    for (const tag of s.tags) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function findShakeyGroundCandidates(summaries: NoteSummary[], vaultPath: string): ShakeyCandidate[] {
  const candidates: ShakeyCandidate[] = [];

  for (const s of summaries) {
    if (!s.summary) continue;

    const note = readNote(s.path);
    if (!note) continue;

    const freshness = getFreshness(note.frontmatter);
    const isolated = s.links.length === 0;
    const neverReinforced = s.confidence === 0.5; // 한 번도 merge(재등장)된 적 없음

    let signal: ShakeyCandidate["signal"] | null = null;

    if (neverReinforced && freshness === "stale") {
      signal = "never_reinforced_and_stale";
    } else if (neverReinforced && isolated) {
      signal = "never_reinforced_and_isolated";
    } else if (!neverReinforced && freshness === "stale") {
      signal = "reinforced_but_stale";
    }

    if (!signal) continue;

    candidates.push({
      slug: s.slug,
      summary: s.summary,
      type: s.type,
      confidence: s.confidence,
      freshness,
      isolated,
      signal,
    });
  }

  // 위험도 높은 순 정렬: never_reinforced_and_stale > never_reinforced_and_isolated > reinforced_but_stale
  const signalOrder: Record<ShakeyCandidate["signal"], number> = {
    never_reinforced_and_stale: 0,
    never_reinforced_and_isolated: 1,
    reinforced_but_stale: 2,
  };

  return candidates
    .sort((a, b) => signalOrder[a.signal] - signalOrder[b.signal])
    .slice(0, 12);
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

  if (snapshot.tagDistribution.length > 0) {
    const top = snapshot.tagDistribution.slice(0, 20);
    lines.push("## Tag Distribution (what topics are covered, and how much)");
    lines.push(top.map((t) => `${t.tag}(${t.count})`).join(", "));
    lines.push("");
  }

  if (snapshot.summaries.length > 0) {
    lines.push("## Notes (slug | type | confidence | summary)");
    for (const s of snapshot.summaries) {
      lines.push(`- ${s.slug} | ${s.type} | ${s.confidence.toFixed(1)} | ${s.summary}`);
    }
    lines.push("");
  }

  if (snapshot.shakeyGroundCandidates.length > 0) {
    lines.push("## Shaky Ground Candidates");
    lines.push("These notes have structural warning signals — they may represent weak spots:");
    for (const c of snapshot.shakeyGroundCandidates) {
      const signalLabel = {
        never_reinforced_and_stale: "seen once + stale",
        never_reinforced_and_isolated: "seen once + no connections",
        reinforced_but_stale: "was reinforced, but now stale",
      }[c.signal];
      lines.push(`- ${c.slug} [${signalLabel}]: ${c.summary}`);
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
    ? `## User Goals (these drive everything — gaps that block these are high priority)\n${goals}\n`
    : "";

  return `You are a learning gap analyst. Your job is to find what the user doesn't know they don't know.

## User Profile
${profile || "(no profile)"}

${goalsSection}
## Current Vault State
${snapshotText}
${focusLine}
## Your task

**Gaps:** Cross-reference the tag distribution and note list against the user's stated goals.
- What topics appear in the goals but are absent or thin in the vault?
- What prerequisite knowledge must exist before the user's stated goals become achievable?
- What areas does the tag distribution reveal they've been avoiding?
- Identify 3-5 specific, actionable gaps. Vague gaps like "React 심화" are not acceptable.
- Each gap must explain exactly WHY it blocks the user's specific goals.
- next_question must be a concrete, testable question. The user should be able to answer it out loud. If they can, the gap is closed.

**Shaky ground:** From the shaky-ground candidates, pick up to 3 whose summary suggests the user needs deeper understanding for their goals. Return their slugs. Do not include ones that are irrelevant to the goals.

**Observation:** Summarize the learning trajectory. What's well-covered? What's the biggest blind spot? What should they do next?

Write in the same language as the user profile (Korean if profile is Korean). Respond as JSON.`;
}

// ─── Output ───

function printResult(snapshot: VaultSnapshot, result: ExploreResult, log: (...args: unknown[]) => void) {
  log("\n━━━ 현황 ━━━");
  for (const folder of snapshot.folders) {
    if (folder.count === 0) continue;
    log(`  ${folder.label}: ${folder.count}개`);
  }
  if (snapshot.tagDistribution.length > 0) {
    const top5 = snapshot.tagDistribution.slice(0, 5).map((t) => `${t.tag}(${t.count})`).join(", ");
    log(`  주요 태그: ${top5}`);
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
    log("  한 번만 봤거나 오래 활용하지 않아 실제 이해가 불확실할 수 있는 개념:");
    for (const slug of result.shaky_ground) {
      const candidate = snapshot.shakeyGroundCandidates.find((c) => c.slug === slug);
      const signalLabel = candidate ? {
        never_reinforced_and_stale: "1회 수집 + 방치",
        never_reinforced_and_isolated: "1회 수집 + 연결 없음",
        reinforced_but_stale: "강화됐지만 방치",
      }[candidate.signal] : "";
      const summary = candidate ? ` — ${candidate.summary}` : "";
      log(`  • ${slug}${signalLabel ? ` [${signalLabel}]` : ""}${summary}`);
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

  if (!snapshot.goals) {
    log("\n  MY-PROFILE.md에 목표가 없습니다.");
    log("  `kore-chamber profile`로 목표를 먼저 작성하면 더 정확한 갭 분석이 가능합니다.\n");
  }

  log(`   ${snapshot.totalNotes}개 노트, ${snapshot.tagDistribution.length}개 태그, shaky ${snapshot.shakeyGroundCandidates.length}개`);
  if (focusTopic) log(`   포커스: ${focusTopic}`);

  ensureAuth();

  log("\n🤖 갭 분석 중...\n");
  const snapshotText = buildSnapshotText(snapshot);
  const prompt = buildExplorePrompt(snapshotText, snapshot.profile, snapshot.goals, focusTopic);
  const result = await queryLLM<ExploreResult>(prompt, EXPLORE_SCHEMA);

  if (isJson) {
    console.log(JSON.stringify({
      ok: true,
      snapshot: {
        totalNotes: snapshot.totalNotes,
        tagCount: snapshot.tagDistribution.length,
        shakeyCount: snapshot.shakeyGroundCandidates.length,
        mocs: snapshot.mocs,
      },
      ...result,
    }, null, 2));
    return;
  }

  printResult(snapshot, result, log);
}
