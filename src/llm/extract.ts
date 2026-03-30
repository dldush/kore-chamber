import { queryLLM } from "./claude.js";
import type { NoteType } from "../core/vault.js";

// ─── Re-exports for pipeline convenience ───
export { queryLLM } from "./claude.js";

// ─── Types ───

export interface KnowledgeItem {
  title: string;
  summary: string;
  type: NoteType;
  tags: string[];
  content: string;
  source_context: string;
}

export interface ExtractionResult {
  knowledge_items: KnowledgeItem[];
}

// ─── JSON Schema for LLM output ───

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    knowledge_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Brief title, 3-5 words" },
          summary: {
            type: "string",
            description: "One-sentence summary for dedup and search. Must capture the core concept.",
          },
          type: {
            type: "string",
            enum: ["concept", "troubleshooting", "decision", "pattern"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Technology domain tags",
          },
          content: {
            type: "string",
            description: "Self-contained note body. What it is, how it works, why it matters.",
          },
          source_context: {
            type: "string",
            description: "One sentence — what part of the conversation this came from",
          },
        },
        required: ["title", "summary", "type", "tags", "content", "source_context"],
      },
    },
  },
  required: ["knowledge_items"],
};

// ─── Prompt ───

function buildPrompt(
  conversation: string,
  existingSummaries: string[]
): string {
  const summaryList =
    existingSummaries.length > 0
      ? existingSummaries.map((s) => `- ${s}`).join("\n")
      : "(empty vault)";

  return `You are a knowledge extraction engine. Analyze the conversation below and extract knowledge items.

## Rules

### Knowledge Items
- Extract concepts, troubleshooting (error→cause→fix), decisions (why A over B), and patterns (reusable techniques)
- Each item must be self-contained: include what, how, why, trade-offs
- Skip casual conversation, greetings, meta-discussion, simple commands
- Skip overly specific implementation details (e.g., "changed line 42 of Header.tsx")
- One topic = one item. Don't merge unrelated concepts.
- Write content in the same language as the conversation
- summary must be one sentence that captures the core concept — this is used for dedup and search

### Dedup Hint
These summaries already exist in the vault. Do NOT extract items that overlap with these:
${summaryList}

## Conversation
${conversation}

Extract knowledge items as JSON.`;
}

// ─── Main function ───

export async function extractKnowledge(
  conversation: string,
  existingSummaries: string[]
): Promise<ExtractionResult> {
  const prompt = buildPrompt(conversation, existingSummaries);

  const result = await queryLLM<ExtractionResult>(prompt, EXTRACTION_SCHEMA);

  // Validate and sanitize
  return {
    knowledge_items: (result.knowledge_items || []).filter(
      (item) =>
        item.title &&
        item.type &&
        item.content &&
        item.content.length > 20
    ),
  };
}

// ─── Borderline dedup judgment (AI 2nd pass) ───

export type BorderlineVerdict = "new" | "merge" | "skip";

interface BorderlineResult {
  verdict: BorderlineVerdict;
  reason: string;
}

const BORDERLINE_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["new", "merge", "skip"],
      description: "new=create separate note, merge=combine with existing, skip=duplicate",
    },
    reason: { type: "string", description: "One sentence explanation" },
  },
  required: ["verdict", "reason"],
};

export async function judgeBorderline(
  newSummary: string,
  newContent: string,
  existingSummary: string,
  existingSlug: string
): Promise<BorderlineResult> {
  const prompt = `Compare these two items and decide: should the new item be a separate note, merged into the existing note, or skipped as duplicate?

## Existing note: "${existingSlug}"
Summary: ${existingSummary}

## New item
Summary: ${newSummary}
Content: ${newContent}

## Decision criteria
- "new": Different angle, different depth, or significantly different scope → create separate note
- "merge": Same topic with new information that enriches the existing note → merge
- "skip": Essentially the same content, no new value → skip`;

  return queryLLM<BorderlineResult>(prompt, BORDERLINE_SCHEMA);
}

// ─── Evergreen merge (AI-assisted) ───

interface MergeResult {
  merged_body: string;
  updated_summary: string;
}

const MERGE_SCHEMA = {
  type: "object",
  properties: {
    merged_body: {
      type: "string",
      description: "The merged note body. Integrate new info naturally, remove redundancy.",
    },
    updated_summary: {
      type: "string",
      description: "Updated one-line summary reflecting the expanded scope.",
    },
  },
  required: ["merged_body", "updated_summary"],
};

export async function mergeNotes(
  existingBody: string,
  existingSummary: string,
  newContent: string,
  newSummary: string
): Promise<MergeResult> {
  const prompt = `Merge new content into an existing note. Integrate naturally — don't just append. Remove redundancy, maintain flow.

## Existing note
Summary: ${existingSummary}
Body:
${existingBody}

## New content to integrate
Summary: ${newSummary}
Content:
${newContent}

## Rules
- Preserve all existing information
- Add new information where it fits naturally
- Remove redundant sentences
- Update the summary if the note's scope has grown
- Write in the same language as the existing note
- Keep the ## 관련 노트 section at the end if it exists`;

  return queryLLM<MergeResult>(prompt, MERGE_SCHEMA);
}
