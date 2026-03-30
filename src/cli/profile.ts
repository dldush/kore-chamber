import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../core/config.js";
import { runMigrations } from "../core/migrate.js";

export async function runProfile(args: string[] = []) {
  runMigrations();

  const config = loadConfig();
  const profilePath = path.join(config.vaultPath, "MY-PROFILE.md");

  if (!fs.existsSync(profilePath)) {
    console.error("\n❌ 프로필이 없습니다. kore-chamber init을 먼저 실행하세요.\n");
    process.exit(1);
  }

  if (args[0] === "edit") {
    const editor = process.env.EDITOR || "vi";
    execSync(`${editor} "${profilePath}"`, {
      stdio: "inherit",
      shell: process.env.SHELL || "/bin/sh",
    });
    return;
  }

  const content = fs.readFileSync(profilePath, "utf-8");
  process.stdout.write(content);
  if (!content.endsWith("\n")) {
    process.stdout.write("\n");
  }
}
