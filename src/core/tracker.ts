import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { homedir } from "./platform.js";
import type { JsonlFileInfo } from "./jsonl.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
const PROCESSED_PATH = path.join(KORE_DIR, "processed.yaml");

export interface ProcessedSession {
  processed_at: string;
  notes_created: number;
  source_file: string;
}

export interface ProcessedData {
  version: 1;
  sessions: Record<string, ProcessedSession>;
}

export function loadProcessed(): ProcessedData {
  if (!fs.existsSync(PROCESSED_PATH)) return createEmptyData();

  try {
    const raw = yamlParse(fs.readFileSync(PROCESSED_PATH, "utf-8"));
    if (!raw || typeof raw !== "object") return createEmptyData();

    return {
      version: 1,
      sessions: typeof raw.sessions === "object" && raw.sessions
        ? raw.sessions as Record<string, ProcessedSession>
        : {},
    };
  } catch {
    return createEmptyData();
  }
}

export function isProcessed(sessionId: string): boolean {
  return Boolean(loadProcessed().sessions[sessionId]);
}

export function markProcessed(
  sessionId: string,
  sourceFile: string,
  notesCreated: number
): void {
  const data = loadProcessed();
  data.sessions[sessionId] = {
    processed_at: new Date().toISOString(),
    notes_created: notesCreated,
    source_file: sourceFile,
  };
  saveProcessed(data);
}

export function getUnprocessedSessions(allSessions: JsonlFileInfo[]): JsonlFileInfo[] {
  const processed = loadProcessed().sessions;
  return allSessions.filter((session) => !processed[session.sessionId]);
}

export function getProcessedCount(): number {
  return Object.keys(loadProcessed().sessions).length;
}

function saveProcessed(data: ProcessedData): void {
  fs.mkdirSync(KORE_DIR, { recursive: true });
  fs.writeFileSync(PROCESSED_PATH, yamlStringify(data));
}

function createEmptyData(): ProcessedData {
  return {
    version: 1,
    sessions: {},
  };
}
