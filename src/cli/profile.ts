import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { loadConfig } from "../core/config.js";
import { runMigrations } from "../core/migrate.js";
import {
  createReadline,
  detectProfileLang,
  getProfilePath,
  promptProfileAnswers,
  readProfileAnswers,
  writeProfile,
} from "./profile-form.js";

export async function runProfile(args: string[] = []) {
  runMigrations();

  const config = loadConfig();
  const profilePath = getProfilePath(config.vaultPath);

  if (!fs.existsSync(profilePath)) {
    throw new Error("프로필이 없습니다. kore-chamber init을 먼저 실행하세요.");
  }

  if (args[0] === "show") {
    const content = fs.readFileSync(profilePath, "utf-8");
    process.stdout.write(content);
    if (!content.endsWith("\n")) {
      process.stdout.write("\n");
    }
    return;
  }

  if (args[0] === "edit") {
    const editor = process.env.EDITOR || "vi";
    execSync(`${editor} "${profilePath}"`, {
      stdio: "inherit",
      shell: process.env.SHELL || "/bin/sh",
    });
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("profile 질문형 업데이트는 대화형 터미널에서만 실행할 수 있습니다. `kore-chamber profile show` 또는 `kore-chamber profile edit`를 사용하세요.");
  }

  const rl = createReadline();
  try {
    console.log("\n👤 Kore Chamber — profile\n");
    const current = readProfileAnswers(profilePath);
    const updated = await promptProfileAnswers(rl, detectProfileLang(), current);
    writeProfile(profilePath, {
      ...updated,
      notes: current.notes,
    });
    console.log("\n✅ MY-PROFILE.md를 업데이트했습니다.\n");
  } finally {
    rl.close();
  }
}
