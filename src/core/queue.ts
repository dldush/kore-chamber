import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "./platform.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
const QUEUE_PATH = path.join(KORE_DIR, "queue.jsonl");
const WORKER_LOCK_PATH = path.join(KORE_DIR, "queue-worker.lock");

export type QueueJobStatus = "pending" | "processing" | "done" | "failed";

export interface QueueJob {
  version: 1;
  session_id: string;
  transcript_path: string;
  project_dir: string | null;
  reason: string | null;
  queued_at: string;
  updated_at: string;
  status: QueueJobStatus;
  retry_count: number;
  last_error?: string;
}

interface EnqueueQueueJobInput {
  sessionId: string;
  transcriptPath: string;
  projectDir?: string;
  reason?: string;
}

export function getQueuePath(): string {
  return QUEUE_PATH;
}

export function withQueueWorkerLock<T>(task: () => Promise<T>): Promise<T | null> {
  fs.mkdirSync(KORE_DIR, { recursive: true });

  let fd: number;
  try {
    fd = fs.openSync(WORKER_LOCK_PATH, "wx");
  } catch {
    return Promise.resolve(null);
  }

  fs.writeFileSync(fd, String(process.pid));

  return task().finally(() => {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.unlinkSync(WORKER_LOCK_PATH); } catch { /* ignore */ }
  });
}

export function loadQueue(): QueueJob[] {
  if (!fs.existsSync(QUEUE_PATH)) return [];

  const latestBySession = new Map<string, QueueJob>();
  const lines = fs.readFileSync(QUEUE_PATH, "utf-8").split("\n").filter((line) => line.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as QueueJob;
      if (!parsed.session_id || !parsed.transcript_path) continue;
      latestBySession.set(parsed.session_id, parsed);
    } catch {
      continue;
    }
  }

  return [...latestBySession.values()].sort((a, b) => {
    return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
  });
}

export function enqueueJob(input: EnqueueQueueJobInput): QueueJob {
  const existing = loadQueue().find((job) => job.session_id === input.sessionId);
  if (existing && existing.status !== "failed") {
    return existing;
  }

  const now = new Date().toISOString();
  const job: QueueJob = {
    version: 1,
    session_id: input.sessionId,
    transcript_path: input.transcriptPath,
    project_dir: input.projectDir ?? null,
    reason: input.reason ?? null,
    queued_at: existing?.queued_at ?? now,
    updated_at: now,
    status: "pending",
    retry_count: existing?.retry_count ?? 0,
  };

  appendJob(job);
  return job;
}

export function getPendingJobs(): QueueJob[] {
  return loadQueue().filter((job) => job.status === "pending");
}

export function claimNextJob(): QueueJob | null {
  const next = getPendingJobs()[0];
  if (!next) return null;

  return updateJob(next.session_id, {
    status: "processing",
    updated_at: new Date().toISOString(),
  });
}

export function completeJob(sessionId: string): QueueJob {
  return updateJob(sessionId, {
    status: "done",
    updated_at: new Date().toISOString(),
    last_error: undefined,
  });
}

export function failJob(sessionId: string, error: string): QueueJob {
  const existing = getJob(sessionId);
  return updateJob(sessionId, {
    status: "failed",
    updated_at: new Date().toISOString(),
    retry_count: (existing?.retry_count ?? 0) + 1,
    last_error: error,
  });
}

export function getJob(sessionId: string): QueueJob | null {
  return loadQueue().find((job) => job.session_id === sessionId) ?? null;
}

function updateJob(
  sessionId: string,
  patch: Partial<QueueJob>
): QueueJob {
  const existing = getJob(sessionId);
  if (!existing) {
    throw new Error(`queue job을 찾을 수 없습니다: ${sessionId}`);
  }

  const updated: QueueJob = {
    ...existing,
    ...patch,
  };

  appendJob(updated);
  return updated;
}

function appendJob(job: QueueJob) {
  fs.mkdirSync(KORE_DIR, { recursive: true });
  fs.appendFileSync(QUEUE_PATH, `${JSON.stringify(job)}\n`);
}
