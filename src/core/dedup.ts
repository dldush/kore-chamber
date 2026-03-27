import type { NoteSummary } from "./vault.js";

// ─── Types ───

export type DedupVerdict = "new" | "duplicate" | "borderline";

export interface DedupResult {
  verdict: DedupVerdict;
  similarNote?: string;
  similarNotePath?: string;
  similarity: number;
}

// Thresholds for 3-zone dedup
const CLEAR_NEW = 0.35;      // < this → definitely new
const CLEAR_DUPLICATE = 0.7;  // >= this → definitely duplicate
// Between: borderline → needs AI judgment

/**
 * 1st pass: code-based Jaccard similarity check.
 * Returns one of three zones:
 *   - "new":        < 0.35 similarity → create note
 *   - "borderline": 0.35 ~ 0.7 → needs AI merge/rewrite/new decision
 *   - "duplicate":  >= 0.7 → skip
 */
export function checkDuplicate(
  newSummary: string,
  existingSummaries: NoteSummary[]
): DedupResult {
  const newWords = tokenize(newSummary);

  let maxSimilarity = 0;
  let mostSimilar: NoteSummary | undefined;

  for (const existing of existingSummaries) {
    if (!existing.summary) continue;

    const existingWords = tokenize(existing.summary);
    const sim = jaccardSimilarity(newWords, existingWords);

    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      mostSimilar = existing;
    }
  }

  let verdict: DedupVerdict;
  if (maxSimilarity >= CLEAR_DUPLICATE) {
    verdict = "duplicate";
  } else if (maxSimilarity >= CLEAR_NEW) {
    verdict = "borderline";
  } else {
    verdict = "new";
  }

  return {
    verdict,
    similarNote: mostSimilar?.slug,
    similarNotePath: mostSimilar?.path,
    similarity: maxSimilarity,
  };
}

/**
 * Batch dedup: within a set of new items, find duplicates.
 * Returns indices to keep.
 */
export function batchDedup(summaries: string[]): number[] {
  const keep: number[] = [];
  const tokenized = summaries.map(tokenize);

  for (let i = 0; i < summaries.length; i++) {
    let isDup = false;

    for (const j of keep) {
      if (jaccardSimilarity(tokenized[i], tokenized[j]) >= CLEAR_DUPLICATE) {
        isDup = true;
        break;
      }
    }

    if (!isDup) keep.push(i);
  }

  return keep;
}

// ─── Internals ───

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,;:.!?()[\]{}<>""''`~@#$%^&*+=|/\\]+/)
      .filter((w) => w.length > 1)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
