import * as fs from "node:fs";
import * as path from "node:path";

const CLAUDE_DIR = path.join(process.env.HOME!, ".claude");

function installClaudeFiles(): { skills: string[]; agents: string[] } {
  const commandsDir = path.join(CLAUDE_DIR, "commands");
  const agentsDir = path.join(CLAUDE_DIR, "agents");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const installed = { skills: [] as string[], agents: [] as string[] };

  // Skills
  const skillsSource = path.join(import.meta.dirname, "../../.claude/commands");
  if (fs.existsSync(skillsSource)) {
    for (const file of fs.readdirSync(skillsSource)) {
      if (file.endsWith(".md")) {
        fs.copyFileSync(
          path.join(skillsSource, file),
          path.join(commandsDir, file)
        );
        installed.skills.push(file);
      }
    }
  }

  // Agents
  const agentsSource = path.join(import.meta.dirname, "../../.claude/agents");
  if (fs.existsSync(agentsSource)) {
    for (const file of fs.readdirSync(agentsSource)) {
      if (file.endsWith(".md")) {
        fs.copyFileSync(
          path.join(agentsSource, file),
          path.join(agentsDir, file)
        );
        installed.agents.push(file);
      }
    }
  }

  return installed;
}

function getVersion(): string {
  const pkgPath = path.join(import.meta.dirname, "../../package.json");
  if (fs.existsSync(pkgPath)) {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
  }
  return "unknown";
}

export async function runUpdate() {
  const version = getVersion();
  console.log(`\n🔄 Kore Chamber — update (v${version})\n`);

  const installed = installClaudeFiles();

  console.log("⚡ Skills:");
  for (const f of installed.skills) console.log(`  ✅ ~/.claude/commands/${f}`);

  console.log("\n🤖 Agents:");
  for (const f of installed.agents) console.log(`  ✅ ~/.claude/agents/${f}`);

  console.log(`\n━━━ 업데이트 완료 (v${version}) ━━━\n`);
}
