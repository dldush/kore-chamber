import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { stringify as yamlStringify } from "yaml";

const KORE_DIR = path.join(process.env.HOME!, ".kore-chamber");
const CLAUDE_DIR = path.join(process.env.HOME!, ".claude");

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

async function getVaultPath(rl: readline.Interface): Promise<string> {
  console.log("\n🏛️  Kore Chamber — Give your AI your brain.\n");

  const vaultPath = await ask(
    rl,
    "볼트 경로를 입력하세요 (기존 옵시디언 볼트 경로 또는 새로 생성할 위치)\n> "
  );

  if (!vaultPath) {
    console.error("❌ 볼트 경로가 필요합니다.");
    process.exit(1);
  }

  const resolved = path.resolve(vaultPath.replace(/^~/, process.env.HOME!));
  if (!fs.existsSync(resolved)) {
    console.log(`📁 폴더가 없습니다. 생성합니다: ${resolved}`);
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
  vaultPath: string
): Promise<InitAnswers> {
  const field = await ask(
    rl,
    "\n[1/5] 공부하고 있는 분야\n      (예: 프론트엔드, 백엔드, AI/ML, 디자인, 의학, 법률...)\n      > "
  );

  const level = await ask(
    rl,
    "\n[2/5] 현재 수준\n      (예: 입문 3개월차, 주니어 1년차, 비전공 독학 중...)\n      > "
  );

  const goal = await ask(
    rl,
    "\n[3/5] 목표\n      (예: 1년 내 테크기업 이직, 풀스택 개발자, 논문 작성...)\n      > "
  );

  const learningStyle = await ask(
    rl,
    "\n[4/5] 학습 스타일\n      (예: 개념부터 잡기, 만들면서 배우기, 둘 다...)\n      > "
  );

  const deepInterest = await ask(
    rl,
    "\n[5/5] 특별히 깊이 파고 싶은 영역\n      (예: React 성능 최적화, 시스템 디자인, DB 설계...)\n      > "
  );

  console.log("\n기존 Claude 대화를 스캔하여 초기 볼트를 구축할 수 있습니다.");
  console.log("      1. 전체 스캔 — 모든 대화 로그에서 지식 추출 (시간이 걸릴 수 있음)");
  console.log("      2. 최근 N일만 — 최근 대화만 처리");
  console.log("      3. 건너뛰기 — 빈 볼트에서 시작");
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
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Skills
  const skillsSource = path.join(import.meta.dirname, "../../.claude/commands");
  if (fs.existsSync(skillsSource)) {
    for (const file of fs.readdirSync(skillsSource)) {
      if (file.endsWith(".md")) {
        fs.copyFileSync(
          path.join(skillsSource, file),
          path.join(commandsDir, file)
        );
        console.log(`  ⚡ ~/.claude/commands/${file}`);
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
        console.log(`  🤖 ~/.claude/agents/${file}`);
      }
    }
  }
}

// ─── Step 6-7: Save Config ───

function saveConfig(answers: InitAnswers, jsonlPaths: string[]): void {
  fs.mkdirSync(KORE_DIR, { recursive: true });

  // config.yaml
  const config: Record<string, unknown> = { vault_path: answers.vaultPath };
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

function setupClaudeAccess(vaultPath: string): void {
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
    console.log("  🔑 settings.json에 볼트 접근 경로 추가");
  }
}

// ─── Step 9: Global CLAUDE.md vault rules ───

function insertVaultRules(vaultPath: string): void {
  const claudeMdPath = path.join(CLAUDE_DIR, "CLAUDE.md");
  let content = "";

  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, "utf-8");
  }

  const marker = "## Kore-Chamber Knowledge Vault";
  if (content.includes(marker)) {
    console.log("  📝 전역 CLAUDE.md에 볼트 규칙이 이미 있습니다");
    return;
  }

  const rules = `

${marker}
사용자의 지식 볼트: ${vaultPath}
볼트 구조와 탐색 방법: ${vaultPath}/AI-GUIDE.md
사용자 프로필: ${vaultPath}/MY-PROFILE.md

- 대화 시작 시 MY-PROFILE.md를 참조하여 사용자의 수준과 목표에 맞게 대화하라
- 사용자의 기존 지식이 필요하면 Spreading Activation으로 탐색:
  1. 대화 주제와 관련된 키워드로 볼트 노트의 summary를 검색 (1차 활성화)
  2. 찾은 노트의 ## 관련 노트 링크를 따라감 (2차 활성화)
  3. 같은 MOC 내 다른 노트를 확인 (3차 활성화)
  4. 활성화된 노트의 summary로 관련성 판단 후, 필요할 때만 본문을 읽어라
- 대화를 마무리할 때 항상 /kc-collect 실행 여부를 물어라
`;

  fs.writeFileSync(claudeMdPath, content + rules);
  console.log("  📝 전역 CLAUDE.md에 볼트 탐색 규칙 삽입");
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
  const rl = createRL();

  try {
    const vaultPath = await getVaultPath(rl);
    const answers = await collectAnswers(rl, vaultPath);

    console.log("\n━━━ 설치 중 ━━━\n");

    console.log("📂 볼트 구조 생성:");
    createVaultStructure(vaultPath);

    console.log("\n⚡ Claude Code 스킬/에이전트 설치:");
    installClaudeFiles();

    const jsonlPaths = collectJsonlPaths(answers.historyOption);

    console.log("\n💾 설정 저장:");
    saveConfig(answers, jsonlPaths);

    console.log("\n🔧 Claude Code 연동:");
    setupClaudeAccess(vaultPath);
    insertVaultRules(vaultPath);

    console.log("\n━━━ 설치 완료 ━━━\n");

    if (jsonlPaths.length > 0) {
      console.log(`📜 JSONL 로그 ${jsonlPaths.length}개 발견 → config.yaml에 저장됨.`);
      console.log(
        "   Claude Code에서 /kc-init을 실행하면 초기 볼트를 구축합니다.\n"
      );
    }

    console.log("다음 단계:");
    console.log("  1. Claude Code를 열고 /kc-init 실행 (프로필 합성 + 초기 볼트 구축)");
    console.log("  2. 평소처럼 AI와 대화");
    console.log("  3. 대화 끝에 /kc-collect");
    console.log("  4. 뭘 모르겠으면 /kc-explore\n");
    console.log("AI에게 나의 뇌를 선물하세요. 🧠\n");
  } finally {
    rl.close();
  }
}

// Direct execution (backward compat with `npx kore-chamber` without subcommand)
if (process.argv[1]?.endsWith("init.js")) {
  runInit().catch(console.error);
}
