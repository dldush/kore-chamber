import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

// ─── Types ───

export type NoteType = "concept" | "troubleshooting" | "decision" | "pattern";

export function isNoteType(value: unknown): value is NoteType {
  return value === "concept" || value === "troubleshooting" || value === "decision" || value === "pattern";
}

export interface NoteFrontmatter {
  title: string;
  created: string;
  tags: string[];
  type: NoteType;
  summary: string;
  confidence: number;
  last_referenced?: string;
}

export interface Note {
  path: string;
  frontmatter: NoteFrontmatter;
  body: string;
}

export interface NoteSummary {
  path: string;
  slug: string;
  summary: string;
  tags: string[];
  type: NoteType;
  links: string[];
  confidence: number;
}

// ─── Knowledge folders ───

const KNOWLEDGE_FOLDERS = [
  "10-Concepts",
  "20-Troubleshooting",
  "30-Decisions",
  "40-Patterns",
];

const TYPE_TO_FOLDER: Record<NoteType, string> = {
  concept: "10-Concepts",
  troubleshooting: "20-Troubleshooting",
  decision: "30-Decisions",
  pattern: "40-Patterns",
};

export function getTypeFolder(type: NoteType): string {
  return TYPE_TO_FOLDER[type];
}

// ─── Frontmatter parsing ───

export function readNote(filePath: string): Note | null {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(content);

  return { path: filePath, frontmatter, body };
}

export function splitFrontmatter(content: string): {
  frontmatter: NoteFrontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return {
      frontmatter: emptyFrontmatter(),
      body: content,
    };
  }

  let raw: Record<string, unknown>;
  try {
    raw = yamlParse(match[1]) || {};
  } catch {
    return {
      frontmatter: emptyFrontmatter(),
      body: match[2],
    };
  }

  return {
    frontmatter: parseFrontmatter(raw),
    body: match[2],
  };
}

function emptyFrontmatter(): NoteFrontmatter {
  return { title: "", created: "", tags: [], type: "concept", summary: "", confidence: 0.5 };
}

function parseFrontmatter(raw: Record<string, unknown>): NoteFrontmatter {
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    created: typeof raw.created === "string" ? raw.created : "",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    type: isNoteType(raw.type) ? raw.type : "concept",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    last_referenced: typeof raw.last_referenced === "string" ? raw.last_referenced : undefined,
  };
}

// ─── Write note ───

export function writeNote(
  filePath: string,
  frontmatter: NoteFrontmatter,
  body: string
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const yaml = yamlStringify(frontmatter).trim();
  const content = `---\n${yaml}\n---\n${body}`;

  fs.writeFileSync(filePath, content);
}

// ─── List all notes ───

export function listNotes(vaultPath: string): string[] {
  const notes: string[] = [];

  for (const folder of [...KNOWLEDGE_FOLDERS, "00-Inbox"]) {
    const dir = path.join(vaultPath, folder);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".md")) {
        notes.push(path.join(dir, file));
      }
    }
  }

  return notes;
}

// ─── Get all summaries (for dedup + search) ───

export function getAllSummaries(vaultPath: string): NoteSummary[] {
  const notes = listNotes(vaultPath);
  const summaries: NoteSummary[] = [];

  for (const notePath of notes) {
    const note = readNote(notePath);
    if (!note) continue;

    const slug = path.basename(notePath, ".md");
    const links = extractLinks(note.body);

    summaries.push({
      path: notePath,
      slug,
      summary: note.frontmatter.summary,
      tags: note.frontmatter.tags,
      type: note.frontmatter.type,
      links,
      confidence: note.frontmatter.confidence,
    });
  }

  return summaries;
}

// ─── Extract wiki-links from body ───

export function extractLinks(body: string): string[] {
  const matches = body.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

// ─── Add link to "## 관련 노트" section ───

export function addRelatedLink(filePath: string, targetSlug: string): boolean {
  const note = readNote(filePath);
  if (!note) return false;

  const link = `[[${targetSlug}]]`;

  // Already linked?
  if (note.body.includes(link)) return false;

  // Find or create "## 관련 노트" section
  if (note.body.includes("## 관련 노트")) {
    const updated = note.body.replace(
      /^## 관련 노트$/m,
      `## 관련 노트\n- ${link}`
    );
    writeNote(filePath, note.frontmatter, updated);
  } else {
    const updated = note.body.trimEnd() + `\n\n## 관련 노트\n- ${link}\n`;
    writeNote(filePath, note.frontmatter, updated);
  }

  return true;
}

// ─── Profile ───

export function readProfile(vaultPath: string): string {
  const profilePath = path.join(vaultPath, "MY-PROFILE.md");
  if (!fs.existsSync(profilePath)) return "";
  return fs.readFileSync(profilePath, "utf-8");
}

// ─── Knowledge lifecycle ───

export function bumpConfidence(filePath: string): void {
  const note = readNote(filePath);
  if (!note) return;

  note.frontmatter.confidence = Math.min(1.0, +(note.frontmatter.confidence + 0.1).toFixed(1));
  writeNote(filePath, note.frontmatter, note.body);
}

export function touchLastReferenced(filePath: string): void {
  const note = readNote(filePath);
  if (!note) return;

  note.frontmatter.last_referenced = new Date().toISOString().split("T")[0];
  writeNote(filePath, note.frontmatter, note.body);
}

export type Freshness = "current" | "aging" | "stale";

export function getFreshness(frontmatter: NoteFrontmatter): Freshness {
  const refDate = frontmatter.last_referenced ?? frontmatter.created;
  if (!refDate) return "stale";

  const days = Math.floor(
    (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 30) return "current";
  if (days <= 90) return "aging";
  return "stale";
}
