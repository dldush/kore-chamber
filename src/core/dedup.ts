import type { NoteSummary } from "./vault.js";
import {
  embed,
  cosineSimilarity,
  getOrComputeEmbedding,
  EMBEDDING_THRESHOLDS,
} from "./embeddings.js";

// ─── Types ───

export type DedupVerdict = "new" | "duplicate" | "borderline";

export interface DedupResult {
  verdict: DedupVerdict;
  similarNote?: string;
  similarNotePath?: string;
  similarity: number;
}

// Kept for config.yaml compatibility
export interface DedupThresholds {
  clearNew: number;
  clearDuplicate: number;
}

// ─── Dedup (embedding-based) ───

export async function checkDuplicate(
  newSlug: string,
  newSummary: string,
  existingSummaries: NoteSummary[],
  embeddingCache: Map<string, number[]>
): Promise<DedupResult> {
  const newVector = await getOrComputeEmbedding(newSlug, newSummary, embeddingCache);

  let maxSimilarity = 0;
  let mostSimilar: NoteSummary | undefined;

  for (const existing of existingSummaries) {
    if (!existing.summary) continue;
    const existingVector = await getOrComputeEmbedding(
      existing.slug,
      existing.summary,
      embeddingCache
    );
    const sim = cosineSimilarity(newVector, existingVector);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      mostSimilar = existing;
    }
  }

  let verdict: DedupVerdict;
  if (maxSimilarity >= EMBEDDING_THRESHOLDS.clearDuplicate) {
    verdict = "duplicate";
  } else if (maxSimilarity >= EMBEDDING_THRESHOLDS.clearNew) {
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

// Dedup within a batch of new items (no cache needed — not yet in vault)
export async function batchDedup(summaries: string[]): Promise<number[]> {
  const vectors = await Promise.all(summaries.map(embed));
  const keep: number[] = [];

  for (let i = 0; i < summaries.length; i++) {
    let isDup = false;
    for (const j of keep) {
      if (cosineSimilarity(vectors[i], vectors[j]) >= EMBEDDING_THRESHOLDS.clearDuplicate) {
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

// ─── Tokenizer (used by linker, moc, search) ───

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();

  const words = text
    .toLowerCase()
    .split(/[\s,;:.!?()[\]{}<>""''`~@#$%^&*+=|/\\—–\-]+/)
    .filter(Boolean);

  for (const word of words) {
    const hasCJK = CJK_RANGE.test(word);

    if (hasCJK) {
      tokens.add(word);

      const stripped = stripKoreanParticles(word);
      if (stripped !== word) tokens.add(stripped);

      const bigramTarget = stripped.length >= 3 ? stripped : word;
      if (bigramTarget.length >= 3) {
        for (let i = 0; i < bigramTarget.length - 1; i++) {
          tokens.add(bigramTarget.substring(i, i + 2));
        }
      }
    } else {
      if (word.length > 1) tokens.add(word);
    }
  }

  return tokens;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
