import * as fs from "node:fs";
import { execSync } from "node:child_process";

/**
 * Query Claude LLM for structured JSON output.
 *
 * Strategy:
 * 1. Try Agent SDK (query function) if available
 * 2. Fallback to `claude -p` CLI
 */
export async function queryLLM<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>
): Promise<T> {
  // Try Agent SDK first
  try {
    return await queryViaSDK<T>(prompt, jsonSchema);
  } catch {
    // Fallback to CLI
    return queryViaCLI<T>(prompt, jsonSchema);
  }
}

async function queryViaSDK<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>
): Promise<T> {
  // Dynamic import — fails gracefully if not installed
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

function queryViaCLI<T>(prompt: string, jsonSchema: Record<string, unknown>): T {
  const schemaStr = JSON.stringify(jsonSchema);

  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = `/tmp/kc-prompt-${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, prompt);

  try {
    const result = execSync(
      `claude -p --output-format json --json-schema '${schemaStr}' < "${tmpFile}"`,
      {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const parsed = JSON.parse(result);

    if (parsed.structured_output) return parsed.structured_output as T;
    if (parsed.result) return JSON.parse(parsed.result) as T;
    return parsed as T;
  } finally {
    fs.unlinkSync(tmpFile);
  }
}
