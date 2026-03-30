import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { parse as yamlParse } from "yaml";
import { checkAuthStatus } from "../llm/claude.js";
import { homedir, isEphemeralInstall, whichCommand } from "../core/platform.js";
import { runMigrations } from "../core/migrate.js";
import { getClaudeSettingsPath } from "../core/claude-settings.js";

const HOME = homedir();
const KORE_DIR = path.join(HOME, ".kore-chamber");

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function runDoctor() {
  runMigrations();
  console.log("\n🩺 Kore Chamber — doctor\n");

  const checks: Check[] = [
    checkFile("config.yaml", path.join(KORE_DIR, "config.yaml")),
    checkVaultPath(),
    checkVaultStructure(),
    checkProfile(),
    checkAIGuide(),
    checkClaudeCLI(),
    checkClaudeAuth(),
    checkGlobalInstall(),
    checkHookScripts(),
    checkHooksRegistered(),
  ];

  let hasError = false;
  for (const check of checks) {
    const icon = check.ok ? "✅" : "❌";
    console.log(`${icon} ${check.label}`);
    if (check.detail) console.log(`   ${check.detail}`);
    if (!check.ok) hasError = true;
  }

  console.log(
    hasError
      ? "\n⚠️  문제가 발견되었습니다. `kore-chamber` 또는 `kore-chamber init`으로 설정을 다시 확인하세요.\n"
      : "\n✅ 모든 검사 통과.\n"
  );
}

function checkFile(name: string, filePath: string): Check {
  return {
    label: name,
    ok: fs.existsSync(filePath),
    detail: fs.existsSync(filePath) ? filePath : `없음: ${filePath}`,
  };
}

function readVaultPath(): string | null {
  const configPath = path.join(KORE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = yamlParse(content);
    const vaultPath = config?.vault_path;
    return typeof vaultPath === "string" ? vaultPath : null;
  } catch {
    return null;
  }
}

function checkVaultPath(): Check {
  const vaultPath = readVaultPath();
  if (!vaultPath) {
    return { label: "볼트 경로", ok: false, detail: "config.yaml 없음 또는 vault_path 누락" };
  }

  return {
    label: "볼트 경로",
    ok: fs.existsSync(vaultPath),
    detail: fs.existsSync(vaultPath) ? vaultPath : `접근 불가: ${vaultPath}`,
  };
}

function checkVaultStructure(): Check {
  const vaultPath = readVaultPath();
  if (!vaultPath) return { label: "볼트 구조", ok: false, detail: "vault_path 없음" };

  const required = ["00-Inbox", "10-Concepts", "20-Troubleshooting", "30-Decisions", "40-Patterns", "50-MOC"];
  const missing = required.filter((folder) => !fs.existsSync(path.join(vaultPath, folder)));

  return {
    label: "볼트 구조",
    ok: missing.length === 0,
    detail: missing.length > 0 ? `누락: ${missing.join(", ")}` : `${required.length}개 폴더 정상`,
  };
}

function checkProfile(): Check {
  const vaultPath = readVaultPath();
  if (!vaultPath) return { label: "MY-PROFILE.md", ok: false };
  return checkFile("MY-PROFILE.md", path.join(vaultPath, "MY-PROFILE.md"));
}

function checkAIGuide(): Check {
  const vaultPath = readVaultPath();
  if (!vaultPath) return { label: "AI-GUIDE.md", ok: false };
  return checkFile("AI-GUIDE.md", path.join(vaultPath, "AI-GUIDE.md"));
}

function checkClaudeCLI(): Check {
  try {
    const result = execSync(whichCommand("claude"), { encoding: "utf-8" }).trim();
    return { label: "Claude CLI", ok: true, detail: result };
  } catch {
    return { label: "Claude CLI", ok: false, detail: "설치되지 않음" };
  }
}

function checkClaudeAuth(): Check {
  const status = checkAuthStatus();
  if (status.loggedIn) {
    const detail = [status.email, status.authMethod].filter(Boolean).join(" / ");
    return { label: "Claude 인증", ok: true, detail };
  }
  return {
    label: "Claude 인증",
    ok: false,
    detail: "로그인 안 됨 — `claude` 실행 후 `/login` 필요",
  };
}

function checkGlobalInstall(): Check {
  if (isEphemeralInstall()) {
    return {
      label: "전역 설치",
      ok: false,
      detail: "npx 임시 경로 — hooks 자동화를 위해 `npm install -g kore-chamber` 권장",
    };
  }

  const entry = process.argv[1] ?? "";
  let resolved = entry;
  try {
    resolved = fs.realpathSync(path.resolve(entry));
  } catch { /* 못 읽으면 원래 경로 사용 */ }

  return { label: "전역 설치", ok: true, detail: resolved };
}

function checkHookScripts(): Check {
  const hooksDir = path.join(KORE_DIR, "hooks");
  const scripts = ["session-end.sh", "session-start.sh", "user-prompt.sh"];
  const missing = scripts.filter((s) => !fs.existsSync(path.join(hooksDir, s)));

  return {
    label: "hook 스크립트",
    ok: missing.length === 0,
    detail: missing.length > 0
      ? `없음: ${missing.join(", ")} — \`kore-chamber hooks install\` 실행 필요`
      : hooksDir,
  };
}

function checkHooksRegistered(): Check {
  const settingsPath = getClaudeSettingsPath("user");
  if (!fs.existsSync(settingsPath)) {
    return {
      label: "hook 등록",
      ok: false,
      detail: `${settingsPath} 없음 — Claude Code가 설치되어 있는지 확인하세요`,
    };
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return { label: "hook 등록", ok: false, detail: "settings.json 파싱 실패" };
  }

  const events = ["SessionEnd", "SessionStart", "UserPromptSubmit"];
  const hooks = settings?.hooks as Record<string, Array<{ hooks?: Array<{ type: string; command: string }> }>> | undefined;

  const missing = events.filter((event) => {
    const groups = hooks?.[event] ?? [];
    return !groups.some((g) =>
      g.hooks?.some((h) => h.type === "command" && h.command.includes("kore-chamber"))
    );
  });

  return {
    label: "hook 등록",
    ok: missing.length === 0,
    detail: missing.length > 0
      ? `미등록: ${missing.join(", ")} — \`kore-chamber hooks install\` 실행 필요`
      : "SessionEnd / SessionStart / UserPromptSubmit 등록됨",
  };
}
