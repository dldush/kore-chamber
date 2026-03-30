import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
import { stringify as yamlStringify } from "yaml";
import { checkAuthStatus, doLogin } from "../llm/claude.js";
import { defaultVaultPath, homedir, systemLang, whichCommand } from "../core/platform.js";
import { LATEST_CONFIG_VERSION, runMigrations } from "../core/migrate.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");

type Lang = "ko" | "en";

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
  questions: {
    ko: [
      "\n[1/5] 공부하거나 일하는 분야\n      > ",
      "\n[2/5] 현재 수준\n      > ",
      "\n[3/5] 목표\n      > ",
      "\n[4/5] 학습 스타일\n      > ",
      "\n[5/5] 깊이 파고 싶은 영역\n      > ",
    ],
    en: [
      "\n[1/5] Your field\n      > ",
      "\n[2/5] Current level\n      > ",
      "\n[3/5] Goal\n      > ",
      "\n[4/5] Learning style\n      > ",
      "\n[5/5] Area to go deep on\n      > ",
    ],
  },
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
  done: {
    ko: "\n━━━ 설치 완료 ━━━\n",
    en: "\n━━━ Installation complete ━━━\n",
  },
  nextSteps: {
    ko: [
      "다음 단계:",
      "  1. kore-chamber collect --all  (과거 대화에서 초기 볼트 구성)",
      "  2. 평소처럼 AI와 대화",
      "  3. kore-chamber collect         (새 대화에서 지식 수집)",
      "  4. kore-chamber status          (볼트 현황 확인)",
    ],
    en: [
      "Next steps:",
      "  1. kore-chamber collect --all  (bootstrap from past conversations)",
      "  2. Keep talking to AI as usual",
      "  3. kore-chamber collect        (collect from new conversations)",
      "  4. kore-chamber status         (check vault status)",
    ],
  },
} as const;

function t(entry: { ko: string; en: string }, lang: Lang): string {
  return entry[lang];
}

function tLines(entry: { ko: readonly string[]; en: readonly string[] }, lang: Lang): readonly string[] {
  return entry[lang];
}

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

interface InitAnswers {
  vaultPath: string;
  field: string;
  level: string;
  goal: string;
  learningStyle: string;
  deepInterest: string;
}

async function getVaultPath(rl: readline.Interface, lang: Lang): Promise<string> {
  const def = defaultVaultPath();
  console.log(t(msg.banner, lang));

  const answer = await ask(rl, t(msg.vaultPrompt(def), lang));
  const chosen = answer || def;
  const resolved = path.resolve(chosen.replace(/^~/, homedir()));

  if (!fs.existsSync(resolved)) {
    console.log(t(msg.vaultCreating(resolved), lang));
    fs.mkdirSync(resolved, { recursive: true });
  }

  return resolved;
}

async function collectAnswers(
  rl: readline.Interface,
  vaultPath: string,
  lang: Lang
): Promise<InitAnswers> {
  const prompts = msg.questions[lang];
  const field = await ask(rl, prompts[0]);
  const level = await ask(rl, prompts[1]);
  const goal = await ask(rl, prompts[2]);
  const learningStyle = await ask(rl, prompts[3]);
  const deepInterest = await ask(rl, prompts[4]);

  return { vaultPath, field, level, goal, learningStyle, deepInterest };
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

  const content = [
    "# MY-PROFILE",
    "",
    "## 분야",
    answers.field || "(미입력)",
    "",
    "## 현재 수준",
    answers.level || "(미입력)",
    "",
    "## 목표",
    answers.goal || "(미입력)",
    "",
    "## 학습 스타일",
    answers.learningStyle || "(미입력)",
    "",
    "## 깊이 파고 싶은 영역",
    answers.deepInterest || "(미입력)",
    "",
    "## 메모",
    "(자유롭게 추가하세요)",
    "",
  ].join("\n");

  fs.writeFileSync(profilePath, content);
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
  const rl = createRL();

  try {
    const vaultPath = await getVaultPath(rl, lang);
    const answers = await collectAnswers(rl, vaultPath, lang);

    console.log(t(msg.installing, lang));

    console.log(t(msg.checkCli, lang));
    try {
      const claudePath = execSync(whichCommand("claude"), { encoding: "utf-8" }).trim();
      console.log(`  ✅ ${claudePath}\n`);
    } catch {
      for (const line of tLines(msg.cliNotFound, lang)) console.error(line);
      console.error("");
      process.exit(1);
    }

    console.log(t(msg.checkAuth, lang));
    const authStatus = checkAuthStatus();
    if (authStatus.loggedIn) {
      console.log(t(msg.authOk(authStatus.email ?? authStatus.authMethod ?? ""), lang));
    } else {
      const loginOk = doLogin();
      if (!loginOk) {
        for (const line of tLines(msg.authFailed, lang)) console.error(line);
        console.error("");
        process.exit(1);
      }

      const after = checkAuthStatus();
      if (!after.loggedIn) {
        console.error(t(msg.authVerifyFailed, lang));
        process.exit(1);
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

    console.log(t(msg.done, lang));
    for (const line of tLines(msg.nextSteps, lang)) {
      console.log(line);
    }
    console.log("");
  } finally {
    rl.close();
  }
}

if (process.argv[1]?.endsWith("init.js")) {
  runInit().catch(console.error);
}
