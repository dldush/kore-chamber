import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { parse as yamlParse } from "yaml";
import { checkAuthStatus } from "../llm/claude.js";
import { homedir, whichCommand } from "../core/platform.js";
import { checkPendingMigrations } from "../core/migrate.js";

const HOME = homedir();
const KORE_DIR = path.join(HOME, ".kore-chamber");
const CLAUDE_DIR = path.join(HOME, ".claude");

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function runDoctor() {
  checkPendingMigrations();
  console.log("\n🩺 Kore Chamber — doctor\n");

  const checks: Check[] = [
    checkFile("config.yaml", path.join(KORE_DIR, "config.yaml")),
    checkFile("init-answers.yaml", path.join(KORE_DIR, "init-answers.yaml")),
    checkVaultPath(),
    checkVaultStructure(),
    checkProfile(),
    checkAIGuide(),
    checkCommands(),
    checkSkills(),
    checkAgents(),
    checkClaudeCLI(),
    checkClaudeAuth(),
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
      ? "\n⚠️  문제가 발견되었습니다. npx kore-chamber init으로 재설치하세요.\n"
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
  const missing = required.filter((f) => !fs.existsSync(path.join(vaultPath, f)));

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

function checkCommands(): Check {
  const commands = ["kc-init.md", "kc-explore.md"];
  const dir = path.join(CLAUDE_DIR, "commands");
  const missing = commands.filter((f) => !fs.existsSync(path.join(dir, f)));

  return {
    label: "커맨드 (commands)",
    ok: missing.length === 0,
    detail: missing.length > 0 ? `누락: ${missing.join(", ")}` : `${commands.length}개 설치됨`,
  };
}

function checkSkills(): Check {
  const skills = ["kc-collect"];
  const dir = path.join(CLAUDE_DIR, "skills");
  const missing = skills.filter((f) => !fs.existsSync(path.join(dir, f, "SKILL.md")));

  return {
    label: "스킬 (skills)",
    ok: missing.length === 0,
    detail: missing.length > 0 ? `누락: ${missing.join(", ")}` : `${skills.length}개 설치됨`,
  };
}

function checkAgents(): Check {
  const agents = ["scavenger.md", "sentinel.md", "librarian.md", "explorer.md"];
  const dir = path.join(CLAUDE_DIR, "agents");
  const missing = agents.filter((f) => !fs.existsSync(path.join(dir, f)));

  return {
    label: "에이전트 (agents)",
    ok: missing.length === 0,
    detail: missing.length > 0 ? `누락: ${missing.join(", ")}` : `${agents.length}개 설치됨`,
  };
}

function checkClaudeCLI(): Check {
  try {
    const result = execSync(whichCommand("claude"), { encoding: "utf-8" }).trim();
    return { label: "Claude Code CLI", ok: true, detail: result };
  } catch {
    return { label: "Claude Code CLI", ok: false, detail: "설치되지 않음" };
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
    detail: "로그인 안 됨 — `claude login` 실행 필요",
  };
}
