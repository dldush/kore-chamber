import type { NoteSummary } from "./vault.js";
import { addRelatedLink } from "./vault.js";
import { getMOCNotes } from "./moc.js";

export interface ActivatedNote {
  slug: string;
  path: string;
  weight: number;
  reason: string;
}

/**
 * BFS-based related note search (Spreading Activation).
 *
 * 1st degree (1.0): tags overlap >= 2 or summary keyword match
 * 2nd degree (0.5): follow existing links from 1st degree notes
 * 3rd degree (0.3): same MOC neighbors
 */
export function searchRelated(
  newSlug: string,
  newTags: string[],
  newSummary: string,
  allNotes: NoteSummary[],
  mocPath: string | null
): ActivatedNote[] {
  const activated = new Map<string, ActivatedNote>();
  const keywords = extractKeywords(newSummary);

  // 1st degree: direct tag/keyword match
  for (const note of allNotes) {
    if (note.slug === newSlug) continue;

    const tagOverlap = countOverlap(newTags, note.tags);
    const keywordHit = keywords.some(
      (kw) => note.summary.toLowerCase().includes(kw)
    );

    if (tagOverlap >= 2 || keywordHit) {
      activated.set(note.slug, {
        slug: note.slug,
        path: note.path,
        weight: 1.0,
        reason: tagOverlap >= 2 ? `tags: ${tagOverlap}개 겹침` : "summary 키워드 매칭",
      });
    }
  }

  // 2nd degree: follow links from 1st degree notes
  const firstDegree = [...activated.values()];
  for (const note of firstDegree) {
    const existing = allNotes.find((n) => n.slug === note.slug);
    if (!existing) continue;

    for (const linkedSlug of existing.links) {
      if (linkedSlug === newSlug || activated.has(linkedSlug)) continue;
      const linkedNote = allNotes.find((n) => n.slug === linkedSlug);
      if (!linkedNote) continue;

      activated.set(linkedSlug, {
        slug: linkedSlug,
        path: linkedNote.path,
        weight: 0.5,
        reason: `${note.slug}의 링크`,
      });
    }
  }

  // 3rd degree: same MOC neighbors
  if (mocPath) {
    const mocNotes = getMOCNotes(mocPath);
    for (const mocSlug of mocNotes) {
      if (mocSlug === newSlug || activated.has(mocSlug)) continue;
      const mocNote = allNotes.find((n) => n.slug === mocSlug);
      if (!mocNote) continue;

      activated.set(mocSlug, {
        slug: mocSlug,
        path: mocNote.path,
        weight: 0.3,
        reason: "같은 MOC",
      });
    }
  }

  // Filter by threshold and sort by weight
  return [...activated.values()]
    .filter((n) => n.weight >= 0.3)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Add bidirectional links between a new note and related notes.
 * Only links the top N most relevant.
 */
export function addLinks(
  newNotePath: string,
  newSlug: string,
  related: ActivatedNote[],
  maxLinks: number = 5
): number {
  let count = 0;
  const topRelated = related.slice(0, maxLinks);

  for (const rel of topRelated) {
    // new → existing
    if (addRelatedLink(newNotePath, rel.slug)) count++;
    // existing → new (bidirectional)
    addRelatedLink(rel.path, newSlug);
  }

  return count;
}

/**
 * Hebbian linking: items extracted from the same batch get mutual links.
 */
export function addBatchLinks(
  notes: { path: string; slug: string }[]
): number {
  if (notes.length < 2) return 0;

  let count = 0;
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (addRelatedLink(notes[i].path, notes[j].slug)) count++;
      if (addRelatedLink(notes[j].path, notes[i].slug)) count++;
    }
  }

  return count;
}

// ─── Helpers ───

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:.!?()[\]{}<>]+/)
    .filter((w) => w.length > 2);
}

function countOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((t) => t.toLowerCase()));
  return a.filter((t) => setB.has(t.toLowerCase())).length;
}
