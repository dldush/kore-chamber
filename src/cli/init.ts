import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
import { stringify as yamlStringify } from "yaml";
import { checkAuthStatus, doLogin } from "../llm/claude.js";
import { homedir, whichCommand, defaultVaultPath, systemLang } from "../core/platform.js";
import { LATEST_CONFIG_VERSION } from "../core/migrate.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
const CLAUDE_DIR = path.join(homedir(), ".claude");

// ─── i18n ───

type Lang = "ko" | "en";

const msg = {
  banner: {
    ko: "\n🏛️  Kore Chamber — AI에게 나의 뇌를 선물하세요.\n",
    en: "\n🏛️  Kore Chamber — Give your AI your brain.\n",
  },
  vaultPrompt: (def: string) => ({
    ko: `볼트 경로를 입력하세요 (기존 옵시디언 볼트 또는 새로 생성할 위치)\n  기본값: ${def}\n  엔터 = 기본값 사용\n> `,
    en: `Enter vault path (existing Obsidian vault or new location)\n  Default: ${def}\n  Press Enter to use default\n> `,
  }),
  vaultCreating: (p: string) => ({
    ko: `📁 폴더가 없습니다. 생성합니다: ${p}`,
    en: `📁 Folder not found. Creating: ${p}`,
  }),
  questions: {
    ko: [
      "\n[1/5] 공부하고 있는 분야\n      (예: 프론트엔드, 백엔드, AI/ML, 디자인, 의학, 법률...)\n      > ",
      "\n[2/5] 현재 수준\n      (예: 입문 3개월차, 주니어 1년차, 비전공 독학 중...)\n      > ",
      "\n[3/5] 목표\n      (예: 1년 내 테크기업 이직, 풀스택 개발자, 논문 작성...)\n      > ",
      "\n[4/5] 학습 스타일\n      (예: 개념부터 잡기, 만들면서 배우기, 둘 다...)\n      > ",
      "\n[5/5] 특별히 깊이 파고 싶은 영역\n      (예: React 성능 최적화, 시스템 디자인, DB 설계...)\n      > ",
    ],
    en: [
      "\n[1/5] Your field of study\n      (e.g., Frontend, Backend, AI/ML, Design, Medicine, Law...)\n      > ",
      "\n[2/5] Current level\n      (e.g., 3 months in, junior 1 year, self-taught beginner...)\n      > ",
      "\n[3/5] Goal\n      (e.g., Switch to top tech company, become full-stack, write papers...)\n      > ",
      "\n[4/5] Learning style\n      (e.g., Concepts first, learn by building, both...)\n      > ",
      "\n[5/5] Area you want to dive deep into\n      (e.g., React performance, system design, DB design...)\n      > ",
    ],
  },
  historyIntro: {
    ko: [
      "\n기존 Claude 대화를 스캔하여 초기 볼트를 구축할 수 있습니다.",
      "      1. 전체 스캔 — 모든 대화 로그에서 지식 추출 (시간이 걸릴 수 있음)",
      "      2. 최근 7일만 — 최근 대화만 처리",
      "      3. 건너뛰기 — 빈 볼트에서 시작",
    ],
    en: [
      "\nYou can scan existing Claude conversations to bootstrap your vault.",
      "      1. Full scan — extract knowledge from all logs (may take a while)",
      "      2. Recent 7 days only — process recent conversations",
      "      3. Skip — start with an empty vault",
    ],
  },
  installing: {
    ko: "\n━━━ 설치 중 ━━━\n",
    en: "\n━━━ Installing ━━━\n",
  },
  checkCli: {
    ko: "🔍 Claude Code CLI 확인:",
    en: "🔍 Checking Claude Code CLI:",
  },
  cliNotFound: {
    ko: [
      "  ❌ Claude Code CLI가 설치되지 않았습니다.",
      "     https://docs.anthropic.com/en/docs/claude-code 에서 설치하세요.",
    ],
    en: [
      "  ❌ Claude Code CLI is not installed.",
      "     Install from https://docs.anthropic.com/en/docs/claude-code",
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
      '     터미널에서 "claude login"을 직접 실행해보세요.',
    ],
    en: [
      "  ❌ Claude login failed.",
      '     Try running "claude login" manually in your terminal.',
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
  installingSkills: {
    ko: "\n⚡ Claude Code 스킬/에이전트 설치:",
    en: "\n⚡ Installing Claude Code skills/agents:",
  },
  savingConfig: {
    ko: "\n💾 설정 저장:",
    en: "\n💾 Saving config:",
  },
  claudeIntegration: {
    ko: "\n🔧 Claude Code 연동:",
    en: "\n🔧 Claude Code integration:",
  },
  vaultRulesExist: {
    ko: "  📝 전역 CLAUDE.md에 볼트 규칙이 이미 있습니다",
    en: "  📝 Vault rules already exist in global CLAUDE.md",
  },
  vaultRulesInserted: {
    ko: "  📝 전역 CLAUDE.md에 볼트 탐색 규칙 삽입",
    en: "  📝 Vault navigation rules inserted into global CLAUDE.md",
  },
  settingsAdded: {
    ko: "  🔑 settings.json에 볼트 접근 경로 추가",
    en: "  🔑 Vault path added to settings.json",
  },
  done: {
    ko: "\n━━━ 설치 완료 ━━━\n",
    en: "\n━━━ Installation complete ━━━\n",
  },
  jsonlFound: (n: number) => ({
    ko: `📜 JSONL 로그 ${n}개 발견 → config.yaml에 저장됨.\n   Claude Code에서 /kc-init을 실행하면 초기 볼트를 구축합니다.\n`,
    en: `📜 Found ${n} JSONL logs → saved to config.yaml.\n   Run /kc-init in Claude Code to bootstrap your vault.\n`,
  }),
  nextSteps: {
    ko: [
      "다음 단계:",
      "  1. Claude Code를 열고 /kc-init 실행 (프로필 합성 + 초기 볼트 구축)",
      "  2. 평소처럼 AI와 대화",
      "  3. 대화 끝에 /kc-collect",
      "  4. 뭘 모르겠으면 /kc-explore",
      "",
      "AI에게 나의 뇌를 선물하세요. 🧠",
    ],
    en: [
      "Next steps:",
      "  1. Open Claude Code and run /kc-init (profile synthesis + vault bootstrap)",
      "  2. Talk to AI as usual",
      "  3. Run /kc-collect at the end of a conversation",
      "  4. Run /kc-explore when you're not sure what to learn",
      "",
      "Give your AI your brain. 🧠",
    ],
  },
} as const;

function t(entry: { ko: string; en: string }, lang: Lang): string {
  return entry[lang];
}

function tLines(entry: { ko: readonly string[]; en: readonly string[] }, lang: Lang): readonly string[] {
  return entry[lang];
}

// ─── Prompts ───

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

async function askWithDefault(
  rl: readline.Interface,
  question: string,
  defaultVal: string
): Promise<string> {
  const answer = await ask(rl, question);
  return answer || defaultVal;
}

// ─── Step 1: Vault Path ───

async function getVaultPath(rl: readline.Interface, lang: Lang): Promise<string> {
  const def = defaultVaultPath();
  console.log(t(msg.banner, lang));

  const vaultPath = await ask(rl, t(msg.vaultPrompt(def), lang));
  const chosen = vaultPath || def;

  const resolved = path.resolve(chosen.replace(/^~/, homedir()));
  if (!fs.existsSync(resolved)) {
    console.log(t(msg.vaultCreating(resolved), lang));
    fs.mkdirSync(resolved, { recursive: true });
  }

  return resolved;
}

// ─── Step 2: Questions ───

interface InitAnswers {
  vaultPath: string;
  field: string;
  level: string;
  goal: string;
  learningStyle: string;
  deepInterest: string;
  historyOption: string;
}

async function collectAnswers(
  rl: readline.Interface,
  vaultPath: string,
  lang: Lang
): Promise<InitAnswers> {
  const q = msg.questions[lang];

  const field = await ask(rl, q[0]);
  const level = await ask(rl, q[1]);
  const goal = await ask(rl, q[2]);
  const learningStyle = await ask(rl, q[3]);
  const deepInterest = await ask(rl, q[4]);

  for (const line of tLines(msg.historyIntro, lang)) {
    console.log(line);
  }
  const historyOption = await askWithDefault(rl, "      > ", "3");

  return { vaultPath, field, level, goal, learningStyle, deepInterest, historyOption };
}

// ─── Step 3: Create Vault Structure ───

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

  // AI-GUIDE.md
  const aiGuidePath = path.join(vaultPath, "AI-GUIDE.md");
  if (!fs.existsSync(aiGuidePath)) {
    const aiGuideTemplate = fs
      .readFileSync(path.join(import.meta.dirname, "../templates/AI-GUIDE.md"), "utf-8")
      .replace("{{DATE}}", new Date().toISOString().split("T")[0]);
    fs.writeFileSync(aiGuidePath, aiGuideTemplate);
    console.log("  📄 AI-GUIDE.md");
  }
}

// ─── Step 4-5: Install Skills & Agents ───

function installClaudeFiles(): void {
  const commandsDir = path.join(CLAUDE_DIR, "commands");
  const agentsDir = path.join(CLAUDE_DIR, "agents");
  const skillsDir = path.join(CLAUDE_DIR, "skills");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // Commands (kc-init, kc-explore — NOT kc-collect which is now a skill)
  const commandsSource = path.join(import.meta.dirname, "../../.claude/commands");
  if (fs.existsSync(commandsSource)) {
    for (const file of fs.readdirSync(commandsSource)) {
      if (!file.endsWith(".md")) continue;
      if (file === "kc-collect.md") continue; // migrated to skill
      fs.copyFileSync(
        path.join(commandsSource, file),
        path.join(commandsDir, file)
      );
      console.log(`  ⚡ ~/.claude/commands/${file}`);
    }
  }

  // Skills (directory-based)
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
      console.log(`  ⚡ ~/.claude/skills/${entry.name}/`);
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
        console.log(`  🤖 ~/.claude/agents/${file}`);
      }
    }
  }
}

// ─── Step 6-7: Save Config ───

function saveConfig(answers: InitAnswers, jsonlPaths: string[]): void {
  fs.mkdirSync(KORE_DIR, { recursive: true });

  // config.yaml
  const config: Record<string, unknown> = {
    config_version: LATEST_CONFIG_VERSION,
    vault_path: answers.vaultPath,
    dedup: {
      clear_new: 0.30,
      clear_duplicate: 0.70,
    },
  };
  if (jsonlPaths.length > 0) {
    config.history_paths = jsonlPaths;
  }
  fs.writeFileSync(
    path.join(KORE_DIR, "config.yaml"),
    yamlStringify(config)
  );

  // init-answers.yaml
  fs.writeFileSync(
    path.join(KORE_DIR, "init-answers.yaml"),
    yamlStringify(answers)
  );

  console.log("  💾 ~/.kore-chamber/config.yaml");
  console.log("  💾 ~/.kore-chamber/init-answers.yaml");
}

// ─── Step 8: Claude Code vault access ───

function setupClaudeAccess(vaultPath: string, lang: Lang): void {
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  }

  const dirs = (settings.additionalDirectories as string[]) || [];
  if (!dirs.includes(vaultPath)) {
    dirs.push(vaultPath);
    settings.additionalDirectories = dirs;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(t(msg.settingsAdded, lang));
  }
}

// ─── Step 9: Global CLAUDE.md vault rules ───

function insertVaultRules(vaultPath: string, lang: Lang): void {
  const claudeMdPath = path.join(CLAUDE_DIR, "CLAUDE.md");
  let content = "";

  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, "utf-8");
  }

  const marker = "## Kore-Chamber Knowledge Vault";
  if (content.includes(marker)) {
    console.log(t(msg.vaultRulesExist, lang));
    return;
  }

  const rules = `

${marker}
Knowledge vault: ${vaultPath}
Vault structure & navigation: ${vaultPath}/AI-GUIDE.md
User profile: ${vaultPath}/MY-PROFILE.md

- Read MY-PROFILE.md at the start of a conversation to match the user's level and goals
- When prior knowledge is needed, use Spreading Activation to traverse the vault:
  1. Search note summaries by keywords related to the topic (1st activation)
  2. Follow ## Related Notes links from matched notes (2nd activation)
  3. Check neighboring notes within the same MOC (3rd activation)
  4. Judge relevance by summary, read the full body only when needed
- At the end of a conversation, ask if the user wants to run /kc-collect
`;

  fs.writeFileSync(claudeMdPath, content + rules);
  console.log(t(msg.vaultRulesInserted, lang));
}

// ─── Step 10: Collect JSONL paths ───

function collectJsonlPaths(historyOption: string): string[] {
  if (historyOption === "3") return [];

  const paths: string[] = [];

  // ~/.claude/projects/
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (fs.existsSync(projectsDir)) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".jsonl")) paths.push(full);
      }
    };
    walk(projectsDir);
  }

  // ~/.claude/transcripts/
  const transcriptsDir = path.join(CLAUDE_DIR, "transcripts");
  if (fs.existsSync(transcriptsDir)) {
    for (const file of fs.readdirSync(transcriptsDir)) {
      if (file.endsWith(".jsonl")) {
        paths.push(path.join(transcriptsDir, file));
      }
    }
  }

  if (historyOption === "2") {
    // Filter by recent N days — for now default to 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return paths.filter((p) => fs.statSync(p).mtimeMs >= cutoff);
  }

  return paths;
}

// ─── Main ───

export async function runInit() {
  const lang = systemLang();
  const rl = createRL();

  try {
    const vaultPath = await getVaultPath(rl, lang);
    const answers = await collectAnswers(rl, vaultPath, lang);

    console.log(t(msg.installing, lang));

    // Claude CLI 존재 확인
    console.log(t(msg.checkCli, lang));
    try {
      const claudePath = execSync(whichCommand("claude"), { encoding: "utf-8" }).trim();
      console.log(`  ✅ ${claudePath}\n`);
    } catch {
      for (const line of tLines(msg.cliNotFound, lang)) console.error(line);
      console.error("");
      process.exit(1);
    }

    // Claude OAuth 인증 확인
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
      console.log(t(msg.authLoginDone(after.email ?? ""), lang));
    }

    console.log(t(msg.creatingVault, lang));
    createVaultStructure(vaultPath);

    console.log(t(msg.installingSkills, lang));
    installClaudeFiles();

    const jsonlPaths = collectJsonlPaths(answers.historyOption);

    console.log(t(msg.savingConfig, lang));
    saveConfig(answers, jsonlPaths);

    console.log(t(msg.claudeIntegration, lang));
    setupClaudeAccess(vaultPath, lang);
    insertVaultRules(vaultPath, lang);

    console.log(t(msg.done, lang));

    if (jsonlPaths.length > 0) {
      console.log(t(msg.jsonlFound(jsonlPaths.length), lang));
    }

    for (const line of tLines(msg.nextSteps, lang)) {
      console.log(line);
    }
    console.log("");
  } finally {
    rl.close();
  }
}

// Direct execution (backward compat with `npx kore-chamber` without subcommand)
if (process.argv[1]?.endsWith("init.js")) {
  runInit().catch(console.error);
}
