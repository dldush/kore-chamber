import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { extractLinks, getAllSummaries, getFreshness, readNote } from "../core/vault.js";
import { runMigrations } from "../core/migrate.js";
import { findAllJsonl } from "../core/jsonl.js";
import { getProcessedCount, getUnprocessedSessions } from "../core/tracker.js";

export async function runStatus() {
  runMigrations();

  const config = loadConfig();
  const { vaultPath } = config;

  console.log("\n📊 Kore Chamber — status\n");

  const folders = [
    { name: "00-Inbox", label: "미분류" },
    { name: "10-Concepts", label: "개념" },
    { name: "20-Troubleshooting", label: "트러블슈팅" },
    { name: "30-Decisions", label: "결정" },
    { name: "40-Patterns", label: "패턴" },
  ];

  let totalNotes = 0;
  for (const { name, label } of folders) {
    const dir = path.join(vaultPath, name);
    const count = countMd(dir);
    totalNotes += count;
    if (count > 0) console.log(`  📁 ${label}: ${count}개`);
  }

  console.log(`\n  📝 총 노트: ${totalNotes}개`);

  const mocDir = path.join(vaultPath, "50-MOC");
  const mocCount = countMd(mocDir, "MOC-");
  console.log(`  🗂️  MOC: ${mocCount}개`);

  try {
    const allSessions = findAllJsonl();
    const unprocessed = getUnprocessedSessions(allSessions);
    console.log(`  📥 세션 추적: processed ${getProcessedCount()} / unprocessed ${unprocessed.length}`);
  } catch {
    console.log(`  📥 세션 추적: processed ${getProcessedCount()} / unprocessed 0`);
  }

  if (totalNotes === 0) {
    console.log("\n  볼트가 비어있습니다. `kore-chamber collect`로 지식을 수집하세요.\n");
    return;
  }

  const allSummaries = getAllSummaries(vaultPath);
  const mocLinked = new Set<string>();

  if (fs.existsSync(mocDir)) {
    for (const file of fs.readdirSync(mocDir)) {
      if (!file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(mocDir, file), "utf-8");
      const links = extractLinks(content);
      links.forEach((link) => mocLinked.add(link));
    }
  }

  const orphans = allSummaries.filter((note) => !mocLinked.has(note.slug));
  if (orphans.length > 0) {
    console.log(`  ⚠️  MOC 미등록: ${orphans.length}개`);
  }

  const allSlugs = new Set(allSummaries.map((note) => note.slug));
  let brokenCount = 0;
  for (const note of allSummaries) {
    for (const link of note.links) {
      if (!allSlugs.has(link)) brokenCount++;
    }
  }
  if (brokenCount > 0) {
    console.log(`  ⚠️  깨진 링크: ${brokenCount}개`);
  }

  const freshness = { current: 0, aging: 0, stale: 0 };
  for (const summary of allSummaries) {
    const note = readNote(summary.path);
    if (note) freshness[getFreshness(note.frontmatter)]++;
  }
  if (freshness.stale > 0 || freshness.aging > 0) {
    console.log(
      `  🕐 신선도: current ${freshness.current} / aging ${freshness.aging} / stale ${freshness.stale}`
    );
  }

  const avg = allSummaries.reduce((sum, note) => sum + note.confidence, 0) / allSummaries.length;
  console.log(`  💪 평균 confidence: ${avg.toFixed(2)}`);

  const dates = allSummaries
    .map((summary) => {
      const note = fs.readFileSync(summary.path, "utf-8");
      const match = note.match(/created:\s*"?(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .sort()
    .reverse();

  if (dates.length > 0) {
    console.log(`  📅 최근 수집: ${dates[0]}`);
  }

  console.log();
}

function countMd(dir: string, prefix?: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => {
    if (!file.endsWith(".md")) return false;
    if (prefix && !file.startsWith(prefix)) return false;
    return true;
  }).length;
}
