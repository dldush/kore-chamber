import * as fs from "node:fs";
import * as path from "node:path";

const MOC_LINK_LIMIT = 30;

/**
 * Find the best-fit MOC file for a note based on its tags.
 * Matches by checking if any tag appears in the MOC filename or content.
 */
export function findBestMOC(vaultPath: string, tags: string[]): string | null {
  const mocDir = path.join(vaultPath, "50-MOC");
  if (!fs.existsSync(mocDir)) return null;

  const mocFiles = fs
    .readdirSync(mocDir)
    .filter((f) => f.startsWith("MOC-") && f.endsWith(".md"));

  if (mocFiles.length === 0) return null;

  // Score each MOC by tag overlap
  let bestScore = 0;
  let bestMOC: string | null = null;

  for (const mocFile of mocFiles) {
    const mocName = mocFile.replace("MOC-", "").replace(".md", "").toLowerCase();
    let score = 0;

    for (const tag of tags) {
      if (mocName.includes(tag.toLowerCase())) score += 2;

      // Also check MOC content for the tag
      const content = fs.readFileSync(path.join(mocDir, mocFile), "utf-8");
      if (content.toLowerCase().includes(tag.toLowerCase())) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMOC = path.join(mocDir, mocFile);
    }
  }

  return bestMOC;
}

/**
 * Add a wiki-link to a MOC file. Skip if already present.
 */
export function addToMOC(mocPath: string, noteSlug: string): boolean {
  if (!fs.existsSync(mocPath)) return false;

  const content = fs.readFileSync(mocPath, "utf-8");
  const link = `[[${noteSlug}]]`;

  if (content.includes(link)) return false;

  // Append link at the end
  const updated = content.trimEnd() + `\n- ${link}\n`;
  fs.writeFileSync(mocPath, updated);

  return true;
}

/**
 * Count wiki-links in a MOC file.
 */
export function countMOCLinks(mocPath: string): number {
  if (!fs.existsSync(mocPath)) return 0;
  const content = fs.readFileSync(mocPath, "utf-8");
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  return matches ? matches.length : 0;
}

/**
 * Check if a MOC needs splitting (exceeds link limit).
 */
export function needsSplit(mocPath: string): boolean {
  return countMOCLinks(mocPath) > MOC_LINK_LIMIT;
}

/**
 * Get all notes linked from a MOC.
 */
export function getMOCNotes(mocPath: string): string[] {
  if (!fs.existsSync(mocPath)) return [];
  const content = fs.readFileSync(mocPath, "utf-8");
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}
