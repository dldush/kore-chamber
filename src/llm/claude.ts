import * as fs from "node:fs";
import { execSync, spawnSync } from "node:child_process";

/**
 * Check if Claude CLI is authenticated.
 * Runs with inherited stdio so login prompt is visible to the user.
 * Call this once before the first LLM query.
 */
export function ensureAuth(): void {
  const result = spawnSync("claude", ["-p", "reply with ok", "--max-turns", "1"], {
    stdio: "inherit",
    timeout: 60_000,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(
      "Claude CLI 인증에 실패했습니다.\n" +
      "터미널에서 `claude`를 실행하여 로그인하세요."
    );
  }
}

/**
 * Query Claude LLM for structured JSON output.
 *
 * Strategy: CLI first (fast-fail on auth), SDK as fallback.
 */
export async function queryLLM<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>
): Promise<T> {
  // Try CLI first — fails fast with clear error if not authenticated
  try {
    return queryViaCLI<T>(prompt, jsonSchema);
  } catch (cliErr) {
    // Try Agent SDK as fallback (with timeout)
    try {
      return await withTimeout(
        queryViaSDK<T>(prompt, jsonSchema),
        120_000,
        "Agent SDK timeout (120s)"
      );
    } catch {
      // Both failed — throw original CLI error (more informative)
      throw cliErr;
    }
  }
}

// ─── CLI ───

function queryViaCLI<T>(prompt: string, jsonSchema: Record<string, unknown>): T {
  const schemaStr = JSON.stringify(jsonSchema);
  const tmpFile = `/tmp/kc-prompt-${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, prompt);

  try {
    const result = execSync(
      `claude -p --output-format json --json-schema '${schemaStr}' < "${tmpFile}"`,
      {
        encoding: "utf-8",
        timeout: 180_000, // 3 minutes
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const parsed = JSON.parse(result);
    if (parsed.structured_output) return parsed.structured_output as T;
    if (parsed.result) {
      try { return JSON.parse(parsed.result) as T; } catch { /* not JSON */ }
      return parsed.result as T;
    }
    return parsed as T;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Agent SDK ───

async function queryViaSDK<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>
): Promise<T> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  let result = "";

  for await (const message of query({
    prompt,
    options: {
      allowedTools: [],
      outputFormat: { type: "json_schema" as const, schema: jsonSchema },
      maxTurns: 1,
    },
  })) {
    if (typeof message === "string") {
      result += message;
    } else if (message && typeof message === "object") {
      const msg = message as Record<string, unknown>;
      if (msg.result) result = String(msg.result);
      if (msg.structured_output) return msg.structured_output as T;
    }
  }

  return JSON.parse(result) as T;
}

// ─── Timeout helper ───

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}
