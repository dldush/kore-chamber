import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { listNotes, getAllSummaries, extractLinks, readNote, getFreshness } from "../core/vault.js";
import { checkPendingMigrations } from "../core/migrate.js";

export async function runStatus() {
  checkPendingMigrations();
  const config = loadConfig();
  const { vaultPath } = config;

  console.log("\n📊 Kore Chamber — status\n");

  // Folder counts
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

  // MOC count
  const mocDir = path.join(vaultPath, "50-MOC");
  const mocCount = countMd(mocDir, "MOC-");
  console.log(`  🗂️  MOC: ${mocCount}개`);

  if (totalNotes === 0) {
    console.log("\n  볼트가 비어있습니다. /kc-collect로 지식을 수확하세요.\n");
    return;
  }

  // Orphan notes (not linked from any MOC)
  const allSummaries = getAllSummaries(vaultPath);
  const mocLinked = new Set<string>();

  if (fs.existsSync(mocDir)) {
    for (const file of fs.readdirSync(mocDir)) {
      if (!file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(mocDir, file), "utf-8");
      const links = extractLinks(content);
      links.forEach((l) => mocLinked.add(l));
    }
  }

  const orphans = allSummaries.filter((n) => !mocLinked.has(n.slug));
  if (orphans.length > 0) {
    console.log(`  ⚠️  MOC 미등록: ${orphans.length}개`);
  }

  // Broken links
  const allSlugs = new Set(allSummaries.map((n) => n.slug));
  let brokenCount = 0;
  for (const note of allSummaries) {
    for (const link of note.links) {
      if (!allSlugs.has(link)) brokenCount++;
    }
  }
  if (brokenCount > 0) {
    console.log(`  ⚠️  깨진 링크: ${brokenCount}개`);
  }

  // Freshness distribution
  const freshness = { current: 0, aging: 0, stale: 0 };
  for (const s of allSummaries) {
    const note = readNote(s.path);
    if (note) freshness[getFreshness(note.frontmatter)]++;
  }
  if (freshness.stale > 0 || freshness.aging > 0) {
    console.log(
      `  🕐 신선도: current ${freshness.current} / aging ${freshness.aging} / stale ${freshness.stale}`
    );
  }

  // Average confidence
  if (allSummaries.length > 0) {
    const avg =
      allSummaries.reduce((sum, n) => sum + n.confidence, 0) /
      allSummaries.length;
    console.log(`  💪 평균 confidence: ${avg.toFixed(2)}`);
  }

  // Most recent note
  const dates = allSummaries
    .map((n) => {
      const note = fs.readFileSync(n.path, "utf-8");
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
  return fs.readdirSync(dir).filter((f) => {
    if (!f.endsWith(".md")) return false;
    if (prefix && !f.startsWith(prefix)) return false;
    return true;
  }).length;
}
