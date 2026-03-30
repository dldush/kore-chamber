import * as fs from "node:fs";
import * as path from "node:path";
import {
  ensureSessionEndHook,
  ensureSessionStartHook,
  ensureUserPromptSubmitHook,
  getClaudeSettingsPath,
  readClaudeSettings,
  type HookScope,
  writeClaudeSettings,
} from "../core/claude-settings.js";
import { homedir, isEphemeralInstall } from "../core/platform.js";

export async function runHooks(args: string[] = []) {
  const subcommand = args[0];

  switch (subcommand) {
    case "install":
      runHooksInstall(args.slice(1));
      return;
    default:
      printHooksHelp();
      return;
  }
}

function runHooksInstall(args: string[]) {
  const { scope, cwd } = parseInstallArgs(args);
  const cli = resolveCliRuntime();
  const sessionEndScriptPath = writeSessionEndHookScript(cli);
  const sessionStartScriptPath = writeSessionStartHookScript(cli);
  const userPromptScriptPath = writeUserPromptHookScript(cli);
  const settingsPath = getClaudeSettingsPath(scope, cwd);
  const settings = readClaudeSettings(settingsPath);
  const sessionEndCommand = shellQuote(sessionEndScriptPath);
  const sessionStartCommand = shellQuote(sessionStartScriptPath);
  const userPromptCommand = shellQuote(userPromptScriptPath);
  const endResult = ensureSessionEndHook(settings, sessionEndCommand);
  const startResult = ensureSessionStartHook(endResult.settings, sessionStartCommand);
  const promptResult = ensureUserPromptSubmitHook(startResult.settings, userPromptCommand);

  writeClaudeSettings(settingsPath, promptResult.settings);

  console.log("\n🔗 Claude hooks 설치 완료\n");
  console.log(`  scope: ${scope}`);
  console.log(`  settings: ${settingsPath}`);
  console.log(`  session_end: ${sessionEndScriptPath}`);
  console.log(`  session_start: ${sessionStartScriptPath}`);
  console.log(`  user_prompt: ${userPromptScriptPath}`);
  console.log(`  log_dir: ${path.dirname(sessionEndScriptPath)}`);
  console.log(`  entry: ${cli.entryPath}`);
  console.log(`  status: ${endResult.changed || startResult.changed || promptResult.changed ? "installed" : "already up to date"}`);
  console.log("");
  console.log("다음 단계:");
  console.log("  1. Claude Code에서 `/hooks`로 SessionStart / UserPromptSubmit / SessionEnd 등록 여부 확인");
  console.log("  2. 세션 시작 시 context가 들어오는지 확인");
  console.log("  3. 프롬프트 입력 시 관련 노트가 붙는지 확인");
  console.log("  4. 세션 종료 후 `~/.kore-chamber/queue.jsonl`과 hook 로그를 확인");
  console.log("");
}

function parseInstallArgs(args: string[]): { scope: HookScope; cwd: string } {
  let scope: HookScope = "user";
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scope" && args[i + 1]) {
      const value = args[++i];
      if (value === "user" || value === "local" || value === "project") {
        scope = value;
      } else {
        throw new Error(`지원하지 않는 hook scope입니다: ${value}`);
      }
    }

    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = path.resolve(args[++i]);
    }
  }

  return { scope, cwd };
}

function resolveCliRuntime(): { nodePath: string; entryPath: string } {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("현재 kore-chamber 엔트리 경로를 확인할 수 없습니다.");
  }

  const entryPath = fs.realpathSync(path.resolve(entry));
  if (!fs.existsSync(entryPath)) {
    throw new Error(`현재 kore-chamber 엔트리 파일이 없습니다: ${entryPath}`);
  }

  if (isEphemeralInstall()) {
    throw new Error(
      "hooks install은 `npx kore-chamber` 같은 일회성 경로에서 설치하면 안 됩니다.\n" +
      "자동 수집은 나중에도 같은 CLI를 다시 실행해야 하므로 `npm install -g kore-chamber` 또는 로컬 checkout에서 실행하세요."
    );
  }

  return {
    nodePath: fs.realpathSync(process.execPath),
    entryPath,
  };
}


function writeSessionEndHookScript(cli: { nodePath: string; entryPath: string }): string {
  const hooksDir = path.join(homedir(), ".kore-chamber", "hooks");
  const scriptPath = path.join(hooksDir, "session-end.sh");
  const logPath = path.join(hooksDir, "session-end.log");

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(scriptPath, buildSessionEndHookScript({
    nodePath: cli.nodePath,
    entryPath: cli.entryPath,
    logPath,
  }));
  fs.chmodSync(scriptPath, 0o755);

  return scriptPath;
}

function writeSessionStartHookScript(cli: { nodePath: string; entryPath: string }): string {
  const hooksDir = path.join(homedir(), ".kore-chamber", "hooks");
  const scriptPath = path.join(hooksDir, "session-start.sh");
  const logPath = path.join(hooksDir, "session-start.log");

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(scriptPath, buildSessionStartHookScript({
    nodePath: cli.nodePath,
    entryPath: cli.entryPath,
    logPath,
  }));
  fs.chmodSync(scriptPath, 0o755);

  return scriptPath;
}

function writeUserPromptHookScript(cli: { nodePath: string; entryPath: string }): string {
  const hooksDir = path.join(homedir(), ".kore-chamber", "hooks");
  const scriptPath = path.join(hooksDir, "user-prompt.sh");
  const logPath = path.join(hooksDir, "user-prompt.log");

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(scriptPath, buildUserPromptHookScript({
    nodePath: cli.nodePath,
    entryPath: cli.entryPath,
    logPath,
  }));
  fs.chmodSync(scriptPath, 0o755);

  return scriptPath;
}

function buildSessionEndHookScript(input: {
  nodePath: string;
  entryPath: string;
  logPath: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

KORE_NODE=${shellQuote(input.nodePath)}
KORE_ENTRY=${shellQuote(input.entryPath)}
KORE_LOG=${shellQuote(input.logPath)}

mkdir -p "$(dirname "$KORE_LOG")"

INPUT="$(cat)"
if [[ -z "\${INPUT}" ]]; then
  exit 0
fi

printf '\\n[%s] SessionEnd\\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$KORE_LOG"

printf '%s' "$INPUT" | "$KORE_NODE" "$KORE_ENTRY" queue enqueue >> "$KORE_LOG" 2>&1 || exit 0
nohup "$KORE_NODE" "$KORE_ENTRY" queue worker --output json >> "$KORE_LOG" 2>&1 </dev/null &
`;
}

function buildSessionStartHookScript(input: {
  nodePath: string;
  entryPath: string;
  logPath: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

KORE_NODE=${shellQuote(input.nodePath)}
KORE_ENTRY=${shellQuote(input.entryPath)}
KORE_LOG=${shellQuote(input.logPath)}

mkdir -p "$(dirname "$KORE_LOG")"

INPUT="$(cat)"
if [[ -z "\${INPUT}" ]]; then
  exit 0
fi

printf '%s' "$INPUT" | "$KORE_NODE" "$KORE_ENTRY" context session --output hook-json 2>> "$KORE_LOG"
`;
}

function buildUserPromptHookScript(input: {
  nodePath: string;
  entryPath: string;
  logPath: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

KORE_NODE=${shellQuote(input.nodePath)}
KORE_ENTRY=${shellQuote(input.entryPath)}
KORE_LOG=${shellQuote(input.logPath)}

mkdir -p "$(dirname "$KORE_LOG")"

INPUT="$(cat)"
if [[ -z "\${INPUT}" ]]; then
  exit 0
fi

printf '%s' "$INPUT" | "$KORE_NODE" "$KORE_ENTRY" context prompt --output hook-json 2>> "$KORE_LOG"
`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function printHooksHelp() {
  console.log("Usage: kore-chamber hooks <command>");
  console.log("");
  console.log("Commands:");
  console.log("  install [--scope user|local|project] [--cwd <dir>]");
  console.log("");
  console.log("Notes:");
  console.log("  - SessionStart / UserPromptSubmit / SessionEnd hook를 Claude settings JSON에 등록합니다.");
  console.log("  - 자동 수집은 지속 가능한 CLI 경로가 필요하므로 `npx kore-chamber` 설치본에는 권장되지 않습니다.");
  console.log("");
}
