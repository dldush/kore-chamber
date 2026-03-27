import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const HOME = process.env.HOME!;
const KORE_DIR = path.join(HOME, ".kore-chamber");
const CLAUDE_DIR = path.join(HOME, ".claude");

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function runDoctor() {
  console.log("\n🩺 Kore Chamber — doctor\n");

  const checks: Check[] = [
    checkFile("config.yaml", path.join(KORE_DIR, "config.yaml")),
    checkFile("init-answers.yaml", path.join(KORE_DIR, "init-answers.yaml")),
    checkVaultPath(),
    checkVaultStructure(),
    checkProfile(),
    checkAIGuide(),
    checkSkills(),
    checkAgents(),
    checkClaudeCLI(),
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

function checkVaultPath(): Check {
  const configPath = path.join(KORE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { label: "볼트 경로", ok: false, detail: "config.yaml 없음" };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const match = content.match(/vault_path:\s*"?(.+?)"?\s*$/m);
  if (!match) {
    return { label: "볼트 경로", ok: false, detail: "vault_path 없음" };
  }

  const vaultPath = match[1];
  return {
    label: "볼트 경로",
    ok: fs.existsSync(vaultPath),
    detail: fs.existsSync(vaultPath) ? vaultPath : `접근 불가: ${vaultPath}`,
  };
}

function checkVaultStructure(): Check {
  const configPath = path.join(KORE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { label: "볼트 구조", ok: false, detail: "config.yaml 없음" };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const match = content.match(/vault_path:\s*"?(.+?)"?\s*$/m);
  if (!match) return { label: "볼트 구조", ok: false };

  const vaultPath = match[1];
  const required = ["00-Inbox", "10-Concepts", "20-Troubleshooting", "30-Decisions", "40-Patterns", "50-MOC"];
  const missing = required.filter((f) => !fs.existsSync(path.join(vaultPath, f)));

  return {
    label: "볼트 구조",
    ok: missing.length === 0,
    detail: missing.length > 0 ? `누락: ${missing.join(", ")}` : `${required.length}개 폴더 정상`,
  };
}

function checkProfile(): Check {
  const configPath = path.join(KORE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { label: "MY-PROFILE.md", ok: false };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const match = content.match(/vault_path:\s*"?(.+?)"?\s*$/m);
  if (!match) return { label: "MY-PROFILE.md", ok: false };

  const profilePath = path.join(match[1], "MY-PROFILE.md");
  return checkFile("MY-PROFILE.md", profilePath);
}

function checkAIGuide(): Check {
  const configPath = path.join(KORE_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { label: "AI-GUIDE.md", ok: false };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const match = content.match(/vault_path:\s*"?(.+?)"?\s*$/m);
  if (!match) return { label: "AI-GUIDE.md", ok: false };

  const guidePath = path.join(match[1], "AI-GUIDE.md");
  return checkFile("AI-GUIDE.md", guidePath);
}

function checkSkills(): Check {
  const skills = ["kc-init.md", "kc-collect.md", "kc-explore.md"];
  const dir = path.join(CLAUDE_DIR, "commands");
  const missing = skills.filter((f) => !fs.existsSync(path.join(dir, f)));

  return {
    label: "스킬 (commands)",
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
    const result = execSync("which claude", { encoding: "utf-8" }).trim();
    return { label: "Claude Code CLI", ok: true, detail: result };
  } catch {
    return { label: "Claude Code CLI", ok: false, detail: "설치되지 않음" };
  }
}
