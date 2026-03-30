#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hasConfig } from "../core/config.js";

const command = process.argv[2];
const args = process.argv.slice(3);

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[92m",
};

try {
  await main();
} catch (error) {
  if (isAbortError(error)) {
    console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
    process.exit(0);
  }

  throw error;
}

async function main() {
  if (!command) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const selected = await promptCommandMenu();
      if (!selected) return;
      await dispatch(selected, []);
      return;
    }

    printHelp();
    process.exit(1);
  }

  await dispatch(command, args);
}

async function promptCommandMenu(): Promise<string | null> {
  const rl = createInterface({ input, output });

  try {
    renderMenu();

    while (true) {
      let answer = "";

      try {
        answer = (await rl.question(
          `${ANSI.green}${ANSI.bold}SELECT CHANNEL > ${ANSI.reset}`
        )).trim().toLowerCase();
      } catch (error) {
        if (isAbortError(error)) {
          console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
          return null;
        }

        throw error;
      }

      if (!answer) {
        console.log(`${ANSI.dim}CHANNEL REQUIRED :: choose 1, 2, 3, 4, or Q${ANSI.reset}\n`);
        continue;
      }

      if (answer === "1") return "init";
      if (answer === "2") return "collect";
      if (answer === "3") return "explore";
      if (answer === "4") return "edit";
      if (answer === "q" || answer === "quit" || answer === "exit") {
        console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
        return null;
      }

      console.log(`${ANSI.dim}INVALID CHANNEL :: choose 1, 2, 3, 4, or Q${ANSI.reset}\n`);
    }
  } finally {
    rl.close();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "AbortError" ||
    (error as NodeJS.ErrnoException).code === "ABORT_ERR"
  );
}

function renderMenu() {
  const initialized = hasConfig();

  console.log("");
  console.log(`${ANSI.cyan}${ANSI.bold}==============================================================${ANSI.reset}`);
  console.log(`${ANSI.cyan}${ANSI.bold}  KORE CHAMBER :: COMMAND CONSOLE${ANSI.reset}`);
  console.log(`${ANSI.dim}  SOURCE :: CLAUDE JSONL${ANSI.reset}`);
  console.log(`${ANSI.dim}  TARGET :: OBSIDIAN VAULT${ANSI.reset}`);
  console.log(`${ANSI.dim}  STATUS :: ${initialized ? "READY" : "INIT REQUIRED"}${ANSI.reset}`);
  console.log(`${ANSI.cyan}${ANSI.bold}==============================================================${ANSI.reset}`);
  console.log(`${ANSI.green}[1]${ANSI.reset} INIT     ${ANSI.dim}:: BOOTSTRAP VAULT + PROFILE${ANSI.reset}`);
  console.log(`${ANSI.green}[2]${ANSI.reset} COLLECT  ${ANSI.dim}:: HARVEST CONVERSATIONS${ANSI.reset}`);
  console.log(`${ANSI.green}[3]${ANSI.reset} EXPLORE  ${ANSI.dim}:: SCAN KNOWLEDGE GAPS${ANSI.reset}`);
  console.log(`${ANSI.green}[4]${ANSI.reset} EDIT     ${ANSI.dim}:: OPEN MY-PROFILE.md${ANSI.reset}`);
  console.log(`${ANSI.green}[Q]${ANSI.reset} EXIT`);
  console.log(`${ANSI.cyan}${ANSI.bold}--------------------------------------------------------------${ANSI.reset}`);
}

async function dispatch(selectedCommand: string, selectedArgs: string[]) {
  if (requiresSetup(selectedCommand) && !hasConfig()) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("\n❌ 초기 설정이 없습니다. 대화형 터미널에서 `kore-chamber` 또는 `kore-chamber init`을 실행하세요.\n");
      process.exit(1);
    }

    console.log(`\n${ANSI.dim}NO CONFIG DETECTED :: launching init${ANSI.reset}\n`);
    await import("./init.js").then((module) => module.runInit());
  }

  switch (selectedCommand) {
    case "init":
      await import("./init.js").then((module) => module.runInit());
      break;
    case "collect":
      await import("./collect.js").then((module) => module.runCollect(selectedArgs));
      break;
    case "profile":
      await import("./profile.js").then((module) => module.runProfile(selectedArgs));
      break;
    case "edit":
      await import("./profile.js").then((module) => module.runProfile(["edit"]));
      break;
    case "explore":
      await import("./explore.js").then((module) => module.runExplore(selectedArgs));
      break;
    case "doctor":
      await import("./doctor.js").then((module) => module.runDoctor());
      break;
    case "status":
      await import("./status.js").then((module) => module.runStatus());
      break;
    case "mcp":
      await import("../mcp/server.js");
      break;
    default:
      printHelp();
      process.exit(1);
  }
}

function requiresSetup(commandName: string): boolean {
  return ["collect", "profile", "edit", "explore", "status"].includes(commandName);
}

function printHelp() {
  console.log("Usage: kore-chamber <command>");
  console.log("");
  console.log("Run without arguments in a terminal to open the command console.");
  console.log("Recommended install: `npx kore-chamber` or `npm install -g kore-chamber`.");
  console.log("");
  console.log("Commands:");
  console.log("  init                초기 설치 (볼트 생성 + 프로필 생성)");
  console.log("  collect [options]   대화에서 지식 수집");
  console.log("  profile             MY-PROFILE.md 보기 또는 편집");
  console.log("  edit                기본 편집기로 MY-PROFILE.md 열기");
  console.log("  explore [topic]     볼트 갭 분석");
  console.log("  doctor              설치 상태 진단");
  console.log("  status              볼트 통계");
  console.log("  mcp                 MCP 서버 실행 (선택적 수동 사용)");
  console.log("");
  console.log("Collect options:");
  console.log("  --all               미처리 세션 전체 수집");
  console.log("  --dry-run           실제 저장 없이 계획만 표시");
  console.log("  --session <id>      특정 세션 JSONL 지정");
  console.log("  --output <format>   json 또는 markdown (기본: markdown)");
  console.log("");
  console.log("Profile options:");
  console.log("  edit                기본 편집기로 MY-PROFILE.md 열기");
}
