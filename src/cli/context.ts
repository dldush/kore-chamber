import * as fs from "node:fs";
import { loadConfig } from "../core/config.js";
import { buildPromptContext, buildSessionContext } from "../core/context.js";
import { runMigrations } from "../core/migrate.js";

interface SessionStartHookInput {
  cwd?: string;
  source?: string;
  prompt?: string;
}

export async function runContext(args: string[] = []) {
  const subcommand = args[0];

  switch (subcommand) {
    case "session":
      runContextSession(args.slice(1));
      return;
    case "prompt":
      await runContextPrompt(args.slice(1));
      return;
    default:
      printContextHelp();
      return;
  }
}

function runContextSession(args: string[]) {
  runMigrations();

  const output = parseOutput(args);
  const hookInput = readHookInput();
  const cwd = readFlagValue(args, "--cwd") ?? hookInput?.cwd;
  const source = readFlagValue(args, "--source") ?? hookInput?.source;
  const { vaultPath } = loadConfig();
  const context = buildSessionContext(vaultPath, { cwd, source });

  if (output === "hook-json") {
    if (!context) return;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    }, null, 2));
    return;
  }

  if (output === "json") {
    console.log(JSON.stringify({
      ok: true,
      cwd: cwd ?? null,
      source: source ?? null,
      context,
    }, null, 2));
    return;
  }

  if (!context) {
    console.log("");
    return;
  }

  console.log(context);
}

async function runContextPrompt(args: string[]) {
  runMigrations();

  const output = parseOutput(args);
  const hookInput = readHookInput();
  const cwd = readFlagValue(args, "--cwd") ?? hookInput?.cwd;
  const prompt = readFlagValue(args, "--prompt") ?? hookInput?.prompt ?? "";
  const { vaultPath } = loadConfig();
  const context = await buildPromptContext(vaultPath, { cwd, prompt });

  if (output === "hook-json") {
    if (!context) return;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    }, null, 2));
    return;
  }

  if (output === "json") {
    console.log(JSON.stringify({
      ok: true,
      cwd: cwd ?? null,
      prompt,
      context,
    }, null, 2));
    return;
  }

  if (!context) {
    console.log("");
    return;
  }

  console.log(context);
}

function parseOutput(args: string[]): "text" | "json" | "hook-json" {
  const value = readFlagValue(args, "--output");
  if (value === "json" || value === "hook-json") return value;
  return "text";
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function readHookInput(): SessionStartHookInput | null {
  try {
    const raw = fs.readFileSync(0, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionStartHookInput;
    return {
      cwd: parsed.cwd,
      source: parsed.source,
      prompt: parsed.prompt,
    };
  } catch {
    return null;
  }
}

function printContextHelp() {
  console.log("Usage: kore-chamber context <command>");
  console.log("");
  console.log("Commands:");
  console.log("  session [--cwd <dir>] [--source <startup|resume|clear|compact>] [--output text|json|hook-json]");
  console.log("  prompt [--cwd <dir>] [--prompt <text>] [--output text|json|hook-json]");
  console.log("");
}
