import * as fs from "node:fs";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getPendingJobs,
  loadQueue,
  withQueueWorkerLock,
} from "../core/queue.js";
import { getJsonlInfoByPath } from "../core/jsonl.js";

export async function runQueue(args: string[] = []) {
  const subcommand = args[0];

  switch (subcommand) {
    case "enqueue":
      await runQueueEnqueue(args.slice(1));
      return;
    case "worker":
      await runQueueWorker(args.slice(1));
      return;
    case "show":
    case "list":
      runQueueShow(args.slice(1));
      return;
    default:
      printQueueHelp();
      return;
  }
}

async function runQueueEnqueue(args: string[]) {
  let transcriptPath: string | undefined;
  let sessionId: string | undefined;
  let projectDir: string | undefined;
  let reason: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transcript-path" && args[i + 1]) transcriptPath = args[++i];
    if (args[i] === "--session-id" && args[i + 1]) sessionId = args[++i];
    if (args[i] === "--project-dir" && args[i + 1]) projectDir = args[++i];
    if (args[i] === "--reason" && args[i + 1]) reason = args[++i];
  }

  if (!transcriptPath) {
    const hookInput = readHookInput();
    if (hookInput) {
      transcriptPath = hookInput.transcript_path;
      sessionId = sessionId ?? hookInput.session_id;
      projectDir = projectDir ?? hookInput.cwd;
      reason = reason ?? hookInput.reason;
    }
  }

  if (!transcriptPath) {
    throw new Error("queue enqueue에는 --transcript-path가 필요합니다.");
  }

  const info = getJsonlInfoByPath(transcriptPath, projectDir);
  const job = enqueueJob({
    sessionId: sessionId ?? info.sessionId,
    transcriptPath: info.path,
    projectDir,
    reason,
  });

  console.log("\n📥 queue enqueue 완료\n");
  console.log(`  session_id: ${job.session_id}`);
  console.log(`  transcript: ${job.transcript_path}`);
  console.log(`  status: ${job.status}`);
  if (job.project_dir) console.log(`  project_dir: ${job.project_dir}`);
  if (job.reason) console.log(`  reason: ${job.reason}`);
  console.log("");
}

async function runQueueWorker(args: string[]) {
  const isJson = args.includes("--output") && args[args.indexOf("--output") + 1] === "json";
  const locked = await withQueueWorkerLock(async () => {
    let processed = 0;
    let completed = 0;
    let failed = 0;
    const errors: Array<{ session_id: string; error: string }> = [];

    while (true) {
      const job = claimNextJob();
      if (!job) break;
      processed++;

      try {
        const collectArgs = [
          "--transcript-path", job.transcript_path,
          "--output", "json",
          ...(job.project_dir ? ["--project-dir", job.project_dir] : []),
        ];

        const { runCollect } = await import("./collect.js");
        await withSuppressedOutput(() => runCollect(collectArgs));
        completeJob(job.session_id);
        completed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failJob(job.session_id, message);
        failed++;
        errors.push({ session_id: job.session_id, error: message });
      }
    }

    return { ok: true, processed, completed, failed, errors };
  });

  if (!locked) {
    if (isJson) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: "worker_locked" }, null, 2));
      return;
    }

    console.log("\n⏭️  queue worker가 이미 실행 중입니다.\n");
    return;
  }

  if (isJson) {
    console.log(JSON.stringify(locked, null, 2));
    return;
  }

  console.log("\n⚙️  Kore Chamber — queue worker\n");
  console.log(`  processed: ${locked.processed}`);
  console.log(`  completed: ${locked.completed}`);
  console.log(`  failed: ${locked.failed}`);
  if (locked.errors.length > 0) {
    for (const item of locked.errors) {
      console.log(`  - ${item.session_id}: ${item.error}`);
    }
  }
  console.log("");
}

function runQueueShow(args: string[]) {
  const isJson = args.includes("--output") && args[args.indexOf("--output") + 1] === "json";
  const jobs = loadQueue();

  if (isJson) {
    console.log(JSON.stringify({
      ok: true,
      total: jobs.length,
      pending: getPendingJobs().length,
      jobs,
    }, null, 2));
    return;
  }

  console.log("\n📋 Kore Chamber — queue\n");
  console.log(`  total: ${jobs.length}`);
  console.log(`  pending: ${getPendingJobs().length}\n`);

  for (const job of jobs) {
    console.log(`- ${job.session_id}`);
    console.log(`  status: ${job.status}`);
    console.log(`  transcript: ${job.transcript_path}`);
    if (job.project_dir) console.log(`  project_dir: ${job.project_dir}`);
    if (job.reason) console.log(`  reason: ${job.reason}`);
    if (job.last_error) console.log(`  last_error: ${job.last_error}`);
    console.log(`  updated_at: ${job.updated_at}`);
  }

  if (jobs.length === 0) {
    console.log("  queue가 비어 있습니다.");
  }

  console.log("");
}

function printQueueHelp() {
  console.log("Usage: kore-chamber queue <command>");
  console.log("");
  console.log("Commands:");
  console.log("  enqueue --transcript-path <path> [--session-id <id>] [--project-dir <dir>] [--reason <text>]");
  console.log("  worker [--output json]");
  console.log("  show [--output json]");
  console.log("");
}

function readHookInput(): HookInput | null {
  try {
    const raw = fs.readFileSync(0, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HookInput>;
    if (!parsed.transcript_path) return null;

    return {
      transcript_path: parsed.transcript_path,
      session_id: parsed.session_id,
      cwd: parsed.cwd,
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
}

interface HookInput {
  transcript_path: string;
  session_id?: string;
  cwd?: string;
  reason?: string;
}

async function withSuppressedOutput(task: () => Promise<void>) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    await task();
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}
