import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";

// ─── Auth ───

interface AuthStatus {
  loggedIn: boolean;
  email?: string;
  authMethod?: string;
}

/**
 * Check Claude CLI auth status without making an API call.
 * Uses shell: true for Windows compatibility.
 */
export function checkAuthStatus(): AuthStatus {
  try {
    const buf = execSync("claude auth status", {
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const result = buf.toString("utf-8");
    const parsed = JSON.parse(result);
    return {
      loggedIn: parsed.loggedIn === true,
      email: parsed.email,
      authMethod: parsed.authMethod,
    };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Launch interactive Claude OAuth login.
 * We delegate to the official Claude CLI REPL login flow (`/login`),
 * so the browser-based auth remains owned by Claude itself.
 */
export function doLogin(): boolean {
  console.log("\n🔑 Claude 로그인이 필요합니다.");
  console.log("   이제 Claude CLI를 실행합니다.");
  console.log("   Claude가 열리면 `/login`으로 브라우저 인증을 완료한 뒤 `/exit`로 돌아오세요.\n");

  const result = spawnSync("claude", [], {
    stdio: "inherit",
    timeout: 600_000,
    shell: true,
  });
  return result.status === 0;
}

/**
 * Ensure Claude CLI is authenticated.
 * If not logged in, triggers OAuth login flow.
 * Call this before the first LLM query.
 */
export function ensureAuth(): void {
  const status = checkAuthStatus();
  if (status.loggedIn) {
    return;
  }

  // Not logged in — trigger OAuth
  const loginOk = doLogin();
  if (!loginOk) {
    throw new Error(
      'Claude login failed.\nRun `claude`, complete `/login` in the interactive session, then try again.'
    );
  }

  // Verify login succeeded
  const after = checkAuthStatus();
  if (!after.loggedIn) {
    throw new Error(
      'Could not verify authentication after login.\nRun "claude auth status" to check.'
    );
  }

  console.log(`✅ Claude authenticated (${after.email ?? ""})\n`);
}

/**
 * Query Claude LLM for structured JSON output.
 *
 * Strategy: CLI first (fast-fail on auth), SDK as fallback.
 * If auth expires mid-session, re-authenticates and retries once.
 */
export async function queryLLM<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>
): Promise<T> {
  try {
    return await queryLLMInner<T>(prompt, jsonSchema);
  } catch (err) {
    // Check if this is an auth failure — re-auth and retry once
    if (isAuthError(err)) {
      console.log("\n⚠️  Claude 인증이 만료되었습니다. 재인증을 시도합니다...");
      ensureAuth();
      return await queryLLMInner<T>(prompt, jsonSchema);
    }
    throw err;
  }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /auth|login|unauthorized|401|credential|token.*expired/i.test(msg);
}

async function queryLLMInner<T>(
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
  const tmpFile = path.join(os.tmpdir(), `kc-prompt-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, prompt);

  const schemaFile = path.join(os.tmpdir(), `kc-schema-${Date.now()}.json`);
  fs.writeFileSync(schemaFile, schemaStr);

  try {
    const result = execSync(
      `claude -p --output-format json --json-schema "$(cat "${schemaFile}")" < "${tmpFile}"`,
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
    try { fs.unlinkSync(schemaFile); } catch { /* ignore */ }
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
