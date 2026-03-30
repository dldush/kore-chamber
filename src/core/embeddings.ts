import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "./platform.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
export const EMBEDDING_CACHE_PATH = path.join(KORE_DIR, "embeddings.jsonl");

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// Cosine similarity thresholds (L2-normalized vectors)
export const EMBEDDING_THRESHOLDS = {
  clearNew: 0.70,        // below → definitely new
  clearDuplicate: 0.88,  // above → definitely duplicate
} as const;

// ─── Model ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeaturePipeline = (text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>;

let _pipeline: FeaturePipeline | null = null;

async function loadPipeline(): Promise<FeaturePipeline> {
  if (_pipeline) return _pipeline;
  const { pipeline } = await import("@huggingface/transformers");
  _pipeline = await pipeline("feature-extraction", MODEL_NAME, {
    progress_callback: () => {},  // suppress download logs to stdout
  }) as unknown as FeaturePipeline;
  return _pipeline;
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await loadPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// ─── Similarity ───

// Vectors are L2-normalized (normalize: true), so dot product = cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}

// ─── Cache ───

interface EmbeddingCacheEntry {
  slug: string;
  vector: number[];
  updated_at: string;
}

export function loadEmbeddingCache(): Map<string, number[]> {
  if (!fs.existsSync(EMBEDDING_CACHE_PATH)) return new Map();
  const map = new Map<string, number[]>();
  for (const line of fs.readFileSync(EMBEDDING_CACHE_PATH, "utf-8").split("\n").filter(Boolean)) {
    try {
      const entry = JSON.parse(line) as EmbeddingCacheEntry;
      if (entry.slug && Array.isArray(entry.vector)) map.set(entry.slug, entry.vector);
    } catch { continue; }
  }
  return map;
}

export function appendEmbeddingToCache(slug: string, vector: number[]): void {
  fs.mkdirSync(KORE_DIR, { recursive: true });
  const entry: EmbeddingCacheEntry = { slug, vector, updated_at: new Date().toISOString() };
  fs.appendFileSync(EMBEDDING_CACHE_PATH, `${JSON.stringify(entry)}\n`);
}

// Returns cached vector if available, otherwise computes, stores, and returns it
export async function getOrComputeEmbedding(
  slug: string,
  text: string,
  cache: Map<string, number[]>
): Promise<number[]> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const vector = await embed(text);
  cache.set(slug, vector);
  appendEmbeddingToCache(slug, vector);
  return vector;
}
