import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

// ─── Types ───

export interface NoteFrontmatter {
  created: string;
  tags: string[];
  type: string;
  summary: string;
  [key: string]: unknown;
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
  type: string;
  links: string[];
}

// ─── Knowledge folders ───

const KNOWLEDGE_FOLDERS = [
  "10-Concepts",
  "20-Troubleshooting",
  "30-Decisions",
  "40-Patterns",
];

const CATEGORY_TO_FOLDER: Record<string, string> = {
  concept: "10-Concepts",
  troubleshooting: "20-Troubleshooting",
  decision: "30-Decisions",
  pattern: "40-Patterns",
};

export function getCategoryFolder(category: string): string {
  return CATEGORY_TO_FOLDER[category] || "00-Inbox";
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
      frontmatter: { created: "", tags: [], type: "", summary: "" },
      body: content,
    };
  }

  let raw: Record<string, unknown>;
  try {
    raw = yamlParse(match[1]) || {};
  } catch {
    // Malformed YAML frontmatter — return defaults
    return {
      frontmatter: { created: "", tags: [], type: "", summary: "" },
      body: match[2],
    };
  }

  return {
    frontmatter: {
      created: raw.created as string || "",
      tags: (raw.tags as string[]) || [],
      type: raw.type as string || "",
      summary: raw.summary as string || "",
      ...raw,
    },
    body: match[2],
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
      "## 관련 노트",
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

export function updateProfileSection(
  vaultPath: string,
  section: string,
  newContent: string
): void {
  const profilePath = path.join(vaultPath, "MY-PROFILE.md");
  if (!fs.existsSync(profilePath)) return;

  let content = fs.readFileSync(profilePath, "utf-8");
  const sectionRegex = new RegExp(
    `(## ${section}\\n)([\\s\\S]*?)(?=\\n## |$)`
  );

  if (sectionRegex.test(content)) {
    content = content.replace(sectionRegex, `$1${newContent}\n`);
  } else {
    content = content.trimEnd() + `\n\n## ${section}\n${newContent}\n`;
  }

  fs.writeFileSync(profilePath, content);
}
