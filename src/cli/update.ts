import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "../core/platform.js";
import { runMigrations } from "../core/migrate.js";

const CLAUDE_DIR = path.join(homedir(), ".claude");

interface InstallResult {
  commands: string[];
  skills: string[];
  agents: string[];
  removed: string[];
}

function installClaudeFiles(): InstallResult {
  const commandsDir = path.join(CLAUDE_DIR, "commands");
  const agentsDir = path.join(CLAUDE_DIR, "agents");
  const skillsDir = path.join(CLAUDE_DIR, "skills");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  const result: InstallResult = {
    commands: [],
    skills: [],
    agents: [],
    removed: [],
  };

  // Legacy commands (kc-init, kc-explore — NOT kc-collect)
  const commandsSource = path.join(import.meta.dirname, "../../.claude/commands");
  if (fs.existsSync(commandsSource)) {
    for (const file of fs.readdirSync(commandsSource)) {
      if (!file.endsWith(".md")) continue;
      // kc-collect is now a skill, remove old command version
      if (file === "kc-collect.md") {
        const oldPath = path.join(commandsDir, file);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          result.removed.push(`~/.claude/commands/${file}`);
        }
        continue;
      }
      fs.copyFileSync(
        path.join(commandsSource, file),
        path.join(commandsDir, file)
      );
      result.commands.push(file);
    }
  }

  // Skills (new format — directory-based)
  const skillsSource = path.join(import.meta.dirname, "../../.claude/skills");
  if (fs.existsSync(skillsSource)) {
    for (const entry of fs.readdirSync(skillsSource, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const srcDir = path.join(skillsSource, entry.name);
      const destDir = path.join(skillsDir, entry.name);
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }
      result.skills.push(entry.name);
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
        result.agents.push(file);
      }
    }
  }

  return result;
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

  const result = installClaudeFiles();

  if (result.commands.length > 0) {
    console.log("⚡ Commands:");
    for (const f of result.commands) console.log(`  ✅ ~/.claude/commands/${f}`);
  }

  if (result.skills.length > 0) {
    console.log("\n⚡ Skills:");
    for (const f of result.skills) console.log(`  ✅ ~/.claude/skills/${f}/`);
  }

  console.log("\n🤖 Agents:");
  for (const f of result.agents) console.log(`  ✅ ~/.claude/agents/${f}`);

  if (result.removed.length > 0) {
    console.log("\n🗑️  Removed (migrated to skills):");
    for (const f of result.removed) console.log(`  ❌ ${f}`);
  }

  // Config migrations
  const migration = runMigrations();
  if (migration && migration.applied.length > 0) {
    console.log(`\n📦 Config 마이그레이션 (v${migration.from} → v${migration.to}):`);
    for (const desc of migration.applied) console.log(`  ✅ ${desc}`);
  }

  console.log(`\n━━━ 업데이트 완료 (v${version}) ━━━\n`);
}
