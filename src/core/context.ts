import * as path from "node:path";
import { getAllSummaries, readNote, readProfile, type NoteType } from "./vault.js";

export interface SessionContextInput {
  cwd?: string;
  source?: string;
}

export interface PromptContextInput {
  cwd?: string;
  prompt: string;
}

interface ScoredNote {
  slug: string;
  summary: string;
  type: NoteType;
  score: number;
}

const PROFILE_SECTIONS = [
  { heading: "## 분야", label: "분야" },
  { heading: "## 현재 수준", label: "현재 수준" },
  { heading: "## 목표", label: "목표" },
  { heading: "## 학습 스타일", label: "학습 스타일" },
  { heading: "## 깊이 파고 싶은 영역", label: "집중 관심사" },
] as const;

const NOTE_TYPE_LABELS: Record<string, string> = {
  concept: "개념",
  troubleshooting: "트러블슈팅",
  decision: "결정",
  pattern: "패턴",
};

export function buildSessionContext(
  vaultPath: string,
  input: SessionContextInput
): string {
  const sections: string[] = [];

  const profileLines = summarizeProfile(readProfile(vaultPath));
  if (profileLines.length > 0) {
    sections.push("[Kore Chamber Session Context]");
    sections.push("");
    sections.push("User profile");
    for (const line of profileLines) {
      sections.push(`- ${line}`);
    }
  }

  const notes = pickRelevantSessionNotes(vaultPath, input);
  if (notes.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("Recent memory");
    for (const note of notes) {
      const typeLabel = NOTE_TYPE_LABELS[note.type] ?? note.type;
      sections.push(`- [${typeLabel}] ${note.slug}: ${note.summary}`);
    }
  }

  const context = sections.join("\n").trim();
  return context.length <= 1600
    ? context
    : `${context.slice(0, 1597).trimEnd()}...`;
}

export function buildPromptContext(
  vaultPath: string,
  input: PromptContextInput
): string {
  const promptTokens = tokenizeText(input.prompt);
  if (promptTokens.length === 0) return "";

  const summaries = getAllSummaries(vaultPath);
  if (summaries.length === 0) return "";

  const cwdTokens = tokenizeProject(input.cwd);
  const scored = summaries
    .map((summary) => {
      const fields = [summary.slug, summary.summary, ...summary.tags];
      const promptScore = scoreTokens(promptTokens, fields) * 12;
      if (promptScore === 0) return null;

      const cwdScore = scoreTokens(cwdTokens, fields) * 6;
      const confidenceScore = Math.round(summary.confidence * 4);
      const typeScore = scoreType(summary.type);

      return {
        slug: summary.slug,
        summary: singleLine(summary.summary),
        type: summary.type,
        score: promptScore + cwdScore + confidenceScore + typeScore,
      };
    })
    .filter((note): note is ScoredNote => note !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) return "";

  const lines = [
    "[Kore Chamber Relevant Memory]",
    "",
    "Relevant notes",
    ...scored.map((note) => {
      const typeLabel = NOTE_TYPE_LABELS[note.type] ?? note.type;
      return `- [${typeLabel}] ${note.slug}: ${note.summary}`;
    }),
  ];

  return lines.join("\n");
}

function summarizeProfile(profile: string): string[] {
  if (!profile.trim()) return [];

  const lines: string[] = [];

  for (const section of PROFILE_SECTIONS) {
    const value = extractSection(profile, section.heading);
    if (!value || value === "(미입력)" || value === "(자유롭게 추가하세요)") continue;
    lines.push(`${section.label}: ${singleLine(value)}`);
  }

  return lines;
}

function pickRelevantSessionNotes(
  vaultPath: string,
  input: SessionContextInput
): ScoredNote[] {
  const summaries = getAllSummaries(vaultPath);
  if (summaries.length === 0) return [];

  const cwdTokens = tokenizeProject(input.cwd);

  const scored = summaries.map((summary) => {
    const note = readNote(summary.path);
    const createdAt = note?.frontmatter.created || "1970-01-01";
    const lastReferenced = note?.frontmatter.last_referenced ?? createdAt;
    const freshnessScore = scoreDate(lastReferenced) + scoreDate(createdAt) / 2;
    const confidenceScore = Math.round(summary.confidence * 10);
    const projectScore = scoreTokens(cwdTokens, [
      summary.slug,
      summary.summary,
      ...summary.tags,
    ]) * 8;
    const typeScore = scoreType(summary.type);

    return {
      slug: summary.slug,
      summary: singleLine(summary.summary),
      type: summary.type,
      score: freshnessScore + confidenceScore + projectScore + typeScore,
    };
  });

  return scored
    .filter((note) => note.summary.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function tokenizeProject(cwd?: string): string[] {
  if (!cwd) return [];

  const tokens = new Set<string>();
  for (const part of cwd.split(path.sep)) {
    for (const token of tokenizeText(part)) {
      if (token.length >= 3) tokens.add(token);
    }
  }

  return [...tokens];
}

function tokenizeText(input: string): string[] {
  const tokens = new Set<string>();

  for (const token of input.toLowerCase().split(/[^a-z0-9가-힣]+/)) {
    if (token.length >= 2) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

function scoreTokens(tokens: string[], fields: string[]): number {
  if (tokens.length === 0) return 0;

  const haystack = fields.join(" ").toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }

  return score;
}

function scoreType(type: string): number {
  switch (type) {
    case "decision":
      return 6;
    case "troubleshooting":
      return 5;
    case "pattern":
      return 4;
    case "concept":
      return 3;
    default:
      return 0;
  }
}

function scoreDate(dateText: string): number {
  if (!dateText) return 0;
  const timestamp = new Date(dateText).getTime();
  if (Number.isNaN(timestamp)) return 0;

  const ageDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 8;
  if (ageDays <= 30) return 6;
  if (ageDays <= 90) return 3;
  return 1;
}

function extractSection(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() ?? "";
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
