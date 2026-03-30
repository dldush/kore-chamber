import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "./platform.js";

export type HookScope = "user" | "local" | "project";

interface HookHandler {
  type: "command";
  command: string;
  async?: boolean;
  timeout?: number;
}

interface HookMatcherGroup {
  matcher?: string;
  hooks: HookHandler[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcherGroup[]>;
  [key: string]: unknown;
}

export function getClaudeSettingsPath(scope: HookScope, cwd = process.cwd()): string {
  if (scope === "user") {
    return path.join(homedir(), ".claude", "settings.json");
  }

  if (scope === "local") {
    return path.join(cwd, ".claude", "settings.local.json");
  }

  return path.join(cwd, ".claude", "settings.json");
}

export function readClaudeSettings(filePath: string): ClaudeSettings {
  if (!fs.existsSync(filePath)) return {};

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ClaudeSettings;
  } catch {
    throw new Error(`Claude settings JSON을 읽을 수 없습니다: ${filePath}`);
  }
}

export function writeClaudeSettings(filePath: string, settings: ClaudeSettings) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`);
}

export function ensureSessionEndHook(
  settings: ClaudeSettings,
  command: string
): { settings: ClaudeSettings; changed: boolean } {
  return ensureCommandHook(settings, "SessionEnd", {
    type: "command",
    command,
    async: true,
    timeout: 15,
  });
}

export function ensureSessionStartHook(
  settings: ClaudeSettings,
  command: string
): { settings: ClaudeSettings; changed: boolean } {
  return ensureCommandHook(settings, "SessionStart", {
    type: "command",
    command,
    timeout: 10,
  });
}

export function ensureUserPromptSubmitHook(
  settings: ClaudeSettings,
  command: string
): { settings: ClaudeSettings; changed: boolean } {
  return ensureCommandHook(settings, "UserPromptSubmit", {
    type: "command",
    command,
    timeout: 8,
  });
}

function ensureCommandHook(
  settings: ClaudeSettings,
  eventName: string,
  targetHook: HookHandler
): { settings: ClaudeSettings; changed: boolean } {
  const next: ClaudeSettings = {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
    },
  };

  const groups = [...(next.hooks?.[eventName] ?? [])];
  let changed = false;

  const updatedGroups = groups.map((group) => {
    const hooks = group.hooks.map((hook) => {
      if (hook.type !== "command" || hook.command !== targetHook.command) {
        return hook;
      }

      const hookChanged = (
        hook.async !== targetHook.async ||
        hook.timeout !== targetHook.timeout
      );
      changed = changed || hookChanged;
      return {
        ...hook,
        async: targetHook.async,
        timeout: targetHook.timeout,
      };
    });

    return { ...group, hooks };
  });

  const alreadyExists = updatedGroups.some((group) =>
    group.hooks.some((hook) => hook.type === "command" && hook.command === targetHook.command)
  );

  if (alreadyExists) {
    next.hooks![eventName] = updatedGroups;
    return { settings: next, changed };
  }

  updatedGroups.push({
    hooks: [
      targetHook,
    ],
  });

  next.hooks![eventName] = updatedGroups;
  return { settings: next, changed: true };
}
