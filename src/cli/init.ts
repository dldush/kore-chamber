import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { stringify as yamlStringify } from "yaml";
import { checkAuthStatus, doLogin } from "../llm/claude.js";
import { defaultVaultPath, homedir, isEphemeralInstall, systemLang, whichCommand } from "../core/platform.js";
import { LATEST_CONFIG_VERSION, runMigrations } from "../core/migrate.js";
import {
  askQuestion,
  buildProfileContent,
  createReadline,
  type Lang,
  promptProfileAnswers,
} from "./profile-form.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");

const msg = {
  banner: {
    ko: "\n🏛️  Kore Chamber — 대화를 Obsidian 지식으로 정리합니다.\n",
    en: "\n🏛️  Kore Chamber — Turn AI conversations into Obsidian knowledge.\n",
  },
  vaultPrompt: (def: string) => ({
    ko: `볼트 경로를 입력하세요\n  기본값: ${def}\n  엔터 = 기본값 사용\n> `,
    en: `Enter vault path\n  Default: ${def}\n  Press Enter to use default\n> `,
  }),
  vaultCreating: (resolved: string) => ({
    ko: `📁 폴더가 없습니다. 생성합니다: ${resolved}`,
    en: `📁 Folder not found. Creating: ${resolved}`,
  }),
  installing: {
    ko: "\n━━━ 설치 중 ━━━\n",
    en: "\n━━━ Installing ━━━\n",
  },
  checkCli: {
    ko: "🔍 Claude CLI 확인:",
    en: "🔍 Checking Claude CLI:",
  },
  cliNotFound: {
    ko: [
      "  ❌ Claude CLI가 설치되지 않았습니다.",
      "     https://docs.anthropic.com/en/docs/claude-code 에서 설치하세요.",
    ],
    en: [
      "  ❌ Claude CLI is not installed.",
      "     Install it from https://docs.anthropic.com/en/docs/claude-code",
    ],
  },
  checkAuth: {
    ko: "🔑 Claude 인증 확인:",
    en: "🔑 Checking Claude authentication:",
  },
  authOk: (email: string) => ({
    ko: `  ✅ 로그인됨 (${email})\n`,
    en: `  ✅ Logged in (${email})\n`,
  }),
  authLoginDone: (email: string) => ({
    ko: `  ✅ 로그인 완료 (${email})\n`,
    en: `  ✅ Login complete (${email})\n`,
  }),
  authFailed: {
    ko: [
      "  ❌ Claude 로그인에 실패했습니다.",
      '     터미널에서 `claude`를 실행한 뒤 `/login`으로 다시 시도해보세요.',
    ],
    en: [
      "  ❌ Claude login failed.",
      '     Try running `claude`, then complete `/login` in the interactive session.',
    ],
  },
  authVerifyFailed: {
    ko: "  ❌ 로그인 후에도 인증이 확인되지 않습니다.\n",
    en: "  ❌ Authentication could not be verified after login.\n",
  },
  creatingVault: {
    ko: "📂 볼트 구조 생성:",
    en: "📂 Creating vault structure:",
  },
  savingConfig: {
    ko: "\n💾 설정 저장:",
    en: "\n💾 Saving config:",
  },
  creatingProfile: {
    ko: "\n👤 프로필 생성:",
    en: "\n👤 Creating profile:",
  },
  profileExists: {
    ko: "  ↳ MY-PROFILE.md가 이미 있어 유지합니다.",
    en: "  ↳ Existing MY-PROFILE.md kept as-is.",
  },
  hooksInstalling: {
    ko: "\n🔗 Claude hooks 설치:",
    en: "\n🔗 Installing Claude hooks:",
  },
  hooksSkippedNpx: {
    ko: "  ⚠️  npx 실행 중 — hooks 자동화는 `npm install -g kore-chamber` 설치 후 `kore-chamber hooks install`로 실행하세요.",
    en: "  ⚠️  Running via npx — for hook automation, install globally with `npm install -g kore-chamber` then run `kore-chamber hooks install`.",
  },
  hooksFailed: {
    ko: "  ⚠️  hooks 설치 실패 — 나중에 `kore-chamber hooks install`로 재시도하세요.",
    en: "  ⚠️  hooks install failed — retry later with `kore-chamber hooks install`.",
  },
  collectPrompt: {
    ko: "\n과거 대화를 지금 바로 수집할까요? 세션 수에 따라 수 분이 걸릴 수 있습니다. [y/N] ",
    en: "\nBootstrap the vault from past conversations now? This may take a few minutes. [y/N] ",
  },
  collectRunning: {
    ko: "\n📥 과거 세션 수집 중...",
    en: "\n📥 Collecting past sessions...",
  },
  collectFailed: {
    ko: "  ⚠️  수집 중 오류 — 나중에 `kore-chamber collect --all`로 재시도하세요.",
    en: "  ⚠️  Collection failed — retry later with `kore-chamber collect --all`.",
  },
  done: {
    ko: "\n━━━ 설치 완료 ━━━\n",
    en: "\n━━━ Installation complete ━━━\n",
  },
  nextSteps: {
    ko: [
      "다음 단계:",
      "  - 평소처럼 AI와 대화 (세션 종료 시 자동 수집됨)",
      "  - kore-chamber status  (볼트 현황 확인)",
    ],
    en: [
      "Next steps:",
      "  - Keep talking to AI as usual (sessions collected automatically)",
      "  - kore-chamber status  (check vault status)",
    ],
  },
  nextStepsNoHooks: {
    ko: [
      "다음 단계:",
      "  1. npm install -g kore-chamber  (전역 설치)",
      "  2. kore-chamber hooks install   (세션 자동 수집 활성화)",
      "  3. 평소처럼 AI와 대화",
      "  4. kore-chamber status          (볼트 현황 확인)",
    ],
    en: [
      "Next steps:",
      "  1. npm install -g kore-chamber  (install globally)",
      "  2. kore-chamber hooks install   (enable automatic collection)",
      "  3. Keep talking to AI as usual",
      "  4. kore-chamber status          (check vault status)",
    ],
  },
} as const;

function t(entry: { ko: string; en: string }, lang: Lang): string {
  return entry[lang];
}

function tLines(entry: { ko: readonly string[]; en: readonly string[] }, lang: Lang): readonly string[] {
  return entry[lang];
}

interface InitAnswers {
  vaultPath: string;
  field: string;
  level: string;
  goal: string;
  learningStyle: string;
  deepInterest: string;
}

async function getVaultPath(rl: ReturnType<typeof createReadline>, lang: Lang): Promise<string> {
  const def = defaultVaultPath();
  console.log(t(msg.banner, lang));

  const answer = await askQuestion(rl, t(msg.vaultPrompt(def), lang));
  const chosen = answer || def;
  const resolved = path.resolve(chosen.replace(/^~/, homedir()));

  if (!fs.existsSync(resolved)) {
    console.log(t(msg.vaultCreating(resolved), lang));
    fs.mkdirSync(resolved, { recursive: true });
  }

  return resolved;
}

function createVaultStructure(vaultPath: string): void {
  const folders = [
    "00-Inbox",
    "10-Concepts",
    "20-Troubleshooting",
    "30-Decisions",
    "40-Patterns",
    "50-MOC",
    "Templates",
  ];

  for (const folder of folders) {
    const dir = path.join(vaultPath, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  📁 ${folder}/`);
    }
  }

  const aiGuidePath = path.join(vaultPath, "AI-GUIDE.md");
  if (!fs.existsSync(aiGuidePath)) {
    const aiGuideTemplate = fs
      .readFileSync(path.join(import.meta.dirname, "../templates/AI-GUIDE.md"), "utf-8")
      .replace("{{DATE}}", new Date().toISOString().split("T")[0]);
    fs.writeFileSync(aiGuidePath, aiGuideTemplate);
    console.log("  📄 AI-GUIDE.md");
  }
}

function createProfile(vaultPath: string, answers: InitAnswers): boolean {
  const profilePath = path.join(vaultPath, "MY-PROFILE.md");
  if (fs.existsSync(profilePath)) return false;

  fs.writeFileSync(profilePath, buildProfileContent({
    field: answers.field,
    level: answers.level,
    goal: answers.goal,
    learningStyle: answers.learningStyle,
    deepInterest: answers.deepInterest,
    notes: "(자유롭게 추가하세요)",
  }));
  console.log("  📄 MY-PROFILE.md");
  return true;
}

function saveConfig(vaultPath: string): void {
  fs.mkdirSync(KORE_DIR, { recursive: true });

  const config = {
    config_version: LATEST_CONFIG_VERSION,
    vault_path: vaultPath,
    dedup: {
      clear_new: 0.30,
      clear_duplicate: 0.70,
    },
  };

  fs.writeFileSync(path.join(KORE_DIR, "config.yaml"), yamlStringify(config));
  console.log("  💾 ~/.kore-chamber/config.yaml");
}

export async function runInit() {
  runMigrations();

  const lang = systemLang();
  const rl = createReadline();

  try {
    const vaultPath = await getVaultPath(rl, lang);
    const profile = await promptProfileAnswers(rl, lang);
    const answers: InitAnswers = { vaultPath, ...profile };

    console.log(t(msg.installing, lang));

    console.log(t(msg.checkCli, lang));
    try {
      const claudePath = execSync(whichCommand("claude"), { encoding: "utf-8" }).trim();
      console.log(`  ✅ ${claudePath}\n`);
    } catch {
      throw new Error(tLines(msg.cliNotFound, lang).join("\n"));
    }

    console.log(t(msg.checkAuth, lang));
    const authStatus = checkAuthStatus();
    if (authStatus.loggedIn) {
      console.log(t(msg.authOk(authStatus.email ?? authStatus.authMethod ?? ""), lang));
    } else {
      const loginOk = doLogin();
      if (!loginOk) {
        throw new Error(tLines(msg.authFailed, lang).join("\n"));
      }

      const after = checkAuthStatus();
      if (!after.loggedIn) {
        throw new Error(t(msg.authVerifyFailed, lang).trim());
      }
      console.log(t(msg.authLoginDone(after.email ?? after.authMethod ?? ""), lang));
    }

    console.log(t(msg.creatingVault, lang));
    createVaultStructure(vaultPath);

    console.log(t(msg.creatingProfile, lang));
    const created = createProfile(vaultPath, answers);
    if (!created) {
      console.log(t(msg.profileExists, lang));
    }

    console.log(t(msg.savingConfig, lang));
    saveConfig(vaultPath);

    // hooks 설치
    console.log(t(msg.hooksInstalling, lang));
    let hooksInstalled = false;
    if (isEphemeralInstall()) {
      console.log(t(msg.hooksSkippedNpx, lang));
    } else {
      try {
        await import("./hooks.js").then((m) => m.runHooks(["install"]));
        hooksInstalled = true;
      } catch {
        console.log(t(msg.hooksFailed, lang));
      }
    }

    // 과거 세션 수집
    const collectAnswer = await askQuestion(rl, t(msg.collectPrompt, lang));
    if (collectAnswer.toLowerCase() === "y") {
      console.log(t(msg.collectRunning, lang));
      try {
        await import("./collect.js").then((m) => m.runCollect(["--all"]));
      } catch {
        console.log(t(msg.collectFailed, lang));
      }
    }

    console.log(t(msg.done, lang));
    const steps = hooksInstalled ? msg.nextSteps : msg.nextStepsNoHooks;
    for (const line of tLines(steps, lang)) {
      console.log(line);
    }
    console.log("");
  } finally {
    rl.close();
  }
}

if (process.argv[1]?.endsWith("init.js")) {
  runInit().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ ${message}\n`);
    process.exit(1);
  });
}
