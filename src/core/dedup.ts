import type { NoteSummary } from "./vault.js";

// ─── Types ───

export type DedupVerdict = "new" | "duplicate" | "borderline";

export interface DedupResult {
  verdict: DedupVerdict;
  similarNote?: string;
  similarNotePath?: string;
  similarity: number;
}

export interface DedupThresholds {
  clearNew: number;
  clearDuplicate: number;
}

const DEFAULT_THRESHOLDS: DedupThresholds = {
  clearNew: 0.30,
  clearDuplicate: 0.70,
};

/**
 * 1st pass: code-based Jaccard similarity check.
 * Returns one of three zones:
 *   - "new":        below clearNew → create note
 *   - "borderline": between clearNew and clearDuplicate → AI judgment
 *   - "duplicate":  above clearDuplicate → skip
 */
export function checkDuplicate(
  newSummary: string,
  existingSummaries: NoteSummary[],
  thresholds: DedupThresholds = DEFAULT_THRESHOLDS
): DedupResult {
  const newTokens = tokenize(newSummary);

  let maxSimilarity = 0;
  let mostSimilar: NoteSummary | undefined;

  for (const existing of existingSummaries) {
    if (!existing.summary) continue;

    const existingTokens = tokenize(existing.summary);
    const sim = jaccardSimilarity(newTokens, existingTokens);

    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      mostSimilar = existing;
    }
  }

  let verdict: DedupVerdict;
  if (maxSimilarity >= thresholds.clearDuplicate) {
    verdict = "duplicate";
  } else if (maxSimilarity >= thresholds.clearNew) {
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
export function batchDedup(
  summaries: string[],
  thresholds: DedupThresholds = DEFAULT_THRESHOLDS
): number[] {
  const keep: number[] = [];
  const tokenized = summaries.map(tokenize);

  for (let i = 0; i < summaries.length; i++) {
    let isDup = false;

    for (const j of keep) {
      if (jaccardSimilarity(tokenized[i], tokenized[j]) >= thresholds.clearDuplicate) {
        isDup = true;
        break;
      }
    }

    if (!isDup) keep.push(i);
  }

  return keep;
}

// ─── Korean particle stripping ───

// Ordered by length (longest first) to avoid partial matches
const KOREAN_PARTICLES = [
  "에서는", "으로는", "에게서", "으로써", "이라고", "라고는",
  "에서", "에게", "한테", "까지", "부터", "처럼", "같이", "보다",
  "으로", "이랑", "대로", "마저", "조차", "께서",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과",
  "도", "만", "랑",
];

const HANGUL_SYLLABLE = /[\uAC00-\uD7A3]/;
const CJK_RANGE = /[\u3131-\u318E\uAC00-\uD7A3\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/;

function stripKoreanParticles(word: string): string {
  if (!HANGUL_SYLLABLE.test(word)) return word;

  for (const particle of KOREAN_PARTICLES) {
    if (word.endsWith(particle) && word.length > particle.length) {
      const stripped = word.slice(0, -particle.length);
      if (stripped.length >= 2 || (stripped.length === 1 && HANGUL_SYLLABLE.test(stripped))) {
        return stripped;
      }
    }
  }

  return word;
}

// ─── Tokenizer ───

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();

  const words = text
    .toLowerCase()
    .split(/[\s,;:.!?()[\]{}<>""''`~@#$%^&*+=|/\\—–\-]+/)
    .filter(Boolean);

  for (const word of words) {
    const hasCJK = CJK_RANGE.test(word);

    if (hasCJK) {
      // CJK: allow single-char tokens (값, 형, 식 etc.)
      tokens.add(word);

      // Strip Korean particles: 리액트의→리액트, 관리를→관리
      const stripped = stripKoreanParticles(word);
      if (stripped !== word) {
        tokens.add(stripped);
      }

      // Character bigrams for compound word matching: 상태관리→{상태,태관,관리}
      const bigramTarget = stripped.length >= 3 ? stripped : word;
      if (bigramTarget.length >= 3) {
        for (let i = 0; i < bigramTarget.length - 1; i++) {
          tokens.add(bigramTarget.substring(i, i + 2));
        }
      }
    } else {
      // Non-CJK: filter single chars (a, I, etc.)
      if (word.length > 1) tokens.add(word);
    }
  }

  return tokens;
}

// ─── Similarity ───

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
