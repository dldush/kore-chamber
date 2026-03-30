import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "./platform.js";

// ─── Types ───

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface JsonlFileInfo {
  path: string;
  sessionId: string;
  mtime: number;
  projectPath: string;
}

interface JsonlEntry {
  type: "user" | "assistant" | "system" | "file-history-snapshot";
  isSidechain?: boolean;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  sessionId?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
}

// ─── Noise tags to strip from user messages ───

const NOISE_PATTERNS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<command-name>[\s\S]*?<\/command-name>/g,
  /<command-message>[\s\S]*?<\/command-message>/g,
  /<command-args>[\s\S]*?<\/command-args>/g,
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /\[Request interrupted by user.*?\]/g,
];

// ─── Find JSONL ───

export function findAllJsonl(sessionId?: string): JsonlFileInfo[] {
  const claudeDir = path.join(homedir(), ".claude");
  const projectsDir = path.join(claudeDir, "projects");

  if (!fs.existsSync(projectsDir)) {
    throw new Error(`Claude 프로젝트 디렉토리를 찾을 수 없습니다: ${projectsDir}`);
  }

  const jsonlFiles: JsonlFileInfo[] = [];

  const walk = (dir: string, projectPath: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip subagents directories
        if (entry.name === "subagents") continue;
        walk(full, projectPath);
      } else if (entry.name.endsWith(".jsonl")) {
        if (sessionId && !entry.name.startsWith(sessionId)) continue;
        jsonlFiles.push({
          path: full,
          sessionId: path.basename(entry.name, ".jsonl"),
          mtime: fs.statSync(full).mtimeMs,
          projectPath,
        });
      }
    }
  };

  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    walk(path.join(projectsDir, entry.name), entry.name);
  }

  if (jsonlFiles.length === 0) {
    throw new Error(
      sessionId
        ? `세션 ${sessionId}에 해당하는 JSONL 파일을 찾을 수 없습니다.`
        : "JSONL 파일을 찾을 수 없습니다."
    );
  }

  // Sort by modification time, most recent first
  jsonlFiles.sort((a, b) => b.mtime - a.mtime);
  return jsonlFiles;
}

export function findLatestJsonl(sessionId?: string): string {
  return findAllJsonl(sessionId)[0].path;
}

// ─── Parse Session ───

export function parseSession(jsonlPath: string): ConversationTurn[] {
  const content = fs.readFileSync(jsonlPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const turns: ConversationTurn[] = [];

  for (const line of lines) {
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    // Skip non-conversation entries
    if (entry.type !== "user" && entry.type !== "assistant") continue;

    // Skip sidechain (subagent) messages
    if (entry.isSidechain) continue;

    if (!entry.message) continue;

    const text = extractText(entry);
    if (!text) continue;

    turns.push({
      role: entry.type as "user" | "assistant",
      text,
      timestamp: entry.timestamp || "",
    });
  }

  return turns;
}

function extractText(entry: JsonlEntry): string | null {
  const content = entry.message?.content;
  if (!content) return null;

  let text: string;

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    // Extract only text blocks, skip tool_use/tool_result
    const textParts = content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text!);

    if (textParts.length === 0) return null;
    text = textParts.join("\n\n");
  } else {
    return null;
  }

  // Strip noise from user messages
  if (entry.type === "user") {
    for (const pattern of NOISE_PATTERNS) {
      text = text.replace(pattern, "");
    }
    text = text.trim();
    if (!text) return null; // Message was only system tags
  }

  return text;
}

// ─── Format for LLM ───

export function formatConversation(turns: ConversationTurn[]): string {
  return turns
    .map((t) => `[${t.role === "user" ? "User" : "Assistant"}]\n${t.text}`)
    .join("\n\n---\n\n");
}
