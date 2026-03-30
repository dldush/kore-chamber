#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hasConfig } from "../core/config.js";
import { checkAuthStatus } from "../llm/claude.js";
import { CliError, isCliError } from "./errors.js";

const command = process.argv[2];
const args = process.argv.slice(3);

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[92m",
  red: "\x1b[91m",
};

const MENU_CHOICES = [
  { key: "1", command: "init", label: "INIT", description: "BOOTSTRAP VAULT + PROFILE" },
  { key: "2", command: "collect", label: "COLLECT", description: "HARVEST CONVERSATIONS" },
  { key: "3", command: "explore", label: "EXPLORE", description: "SCAN KNOWLEDGE GAPS" },
  { key: "4", command: "profile", label: "PROFILE", description: "UPDATE MY-PROFILE" },
  { key: "5", command: "status", label: "STATUS", description: "SHOW VAULT METRICS" },
  { key: "6", command: "doctor", label: "DOCTOR", description: "RUN SYSTEM CHECKS" },
] as const;

interface DashboardState {
  title: string;
  lines: string[];
  footer: string;
}

try {
  await main();
} catch (error) {
  if (isAbortError(error)) {
    clearScreen();
    console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
    process.exit(0);
  }

  exitWithError(error);
}

async function main() {
  if (!command) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      if (!hasConfig()) {
        clearScreen();
        await import("./init.js").then((m) => m.runInit());
        await runConsoleSession("SETUP COMPLETE", [
          "초기 설치가 완료되었습니다.",
          "",
          "이제 평소처럼 AI와 대화하면 됩니다.",
          "세션이 끝날 때마다 자동으로 지식이 수집됩니다.",
        ]);
      } else {
        await runConsoleSession();
      }
      return;
    }

    printHelp();
    process.exit(1);
  }

  const ok = await runOneShotCommand(command, args);
  if (!ok) {
    process.exit(1);
  }
}

async function runConsoleSession(initialTitle?: string, initialLines?: string[]) {
  const dashboard = createInitialDashboard();
  if (initialTitle) {
    dashboard.title = initialTitle;
    dashboard.lines = initialLines ?? [];
    dashboard.footer = "Setup complete — session active";
  }

  while (true) {
    const selection = await promptCommandMenu(dashboard);
    if (!selection) {
      clearScreen();
      console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
      return;
    }

    await runDashboardCommand(selection, [], dashboard);
  }
}

function createInitialDashboard(): DashboardState {
  return {
    title: "SYSTEM READY",
    lines: [
      "Kore Chamber online.",
      "",
      "출력은 이 중앙 모니터 패널에 유지됩니다.",
      "하단 메뉴는 계속 남아 있고, q를 누를 때만 세션이 종료됩니다.",
      "",
      "주의:",
      "- init / profile / Claude 로그인은 직접 터미널 제어가 필요해서 잠시 대시보드를 벗어납니다.",
      "- status / doctor / collect / explore 결과는 가능하면 이 모니터에 그대로 적재됩니다.",
    ],
    footer: "Persistent session active",
  };
}

async function runOneShotCommand(selectedCommand: string, selectedArgs: string[]): Promise<boolean> {
  try {
    await dispatch(selectedCommand, selectedArgs, { interactive: false });
    return true;
  } catch (error) {
    return reportCommandError(error);
  }
}

async function runDashboardCommand(
  selectedCommand: string,
  selectedArgs: string[],
  dashboard: DashboardState
) {
    if (shouldUsePassthrough(selectedCommand)) {
    await runPassthroughCommand(selectedCommand, selectedArgs, dashboard);
    return;
  }

  dashboard.title = `${selectedCommand.toUpperCase()} :: RUNNING`;
  dashboard.lines = [
    `Command: ${selectedCommand}`,
    "",
    "출력을 모니터에 수집하는 중입니다...",
  ];
  dashboard.footer = "Monitor capture active";
  renderDashboard(dashboard);

  const result = await captureCommandOutput(() =>
    dispatch(selectedCommand, selectedArgs, { interactive: true })
  );

  if (result.ok) {
    dashboard.title = `${selectedCommand.toUpperCase()} :: COMPLETE`;
    dashboard.lines = normalizeMonitorLines(
      result.output || `${selectedCommand} completed without terminal output.`
    );
    dashboard.footer = "Command complete, menu remains active";
    return;
  }

  dashboard.title = `${selectedCommand.toUpperCase()} :: ERROR`;
  dashboard.lines = formatErrorMonitor(result.error, result.output);
  dashboard.footer = "Command failed, session still active";
}

async function runPassthroughCommand(
  selectedCommand: string,
  selectedArgs: string[],
  dashboard: DashboardState
) {
  clearScreen();
  console.log(`${ANSI.cyan}${ANSI.bold}KORE CHAMBER :: DIRECT TERMINAL MODE${ANSI.reset}`);
  console.log(`${ANSI.dim}${selectedCommand} needs direct terminal control. Dashboard will resume after it finishes.${ANSI.reset}\n`);

  try {
    await dispatch(selectedCommand, selectedArgs, { interactive: true });
    dashboard.title = `${selectedCommand.toUpperCase()} :: COMPLETE`;
    dashboard.lines = [
      `${selectedCommand} finished in direct terminal mode.`,
      "",
      "대시보드로 복귀했습니다.",
    ];
    dashboard.footer = "Direct mode complete, session still active";
  } catch (error) {
    dashboard.title = `${selectedCommand.toUpperCase()} :: ERROR`;
    dashboard.lines = formatErrorMonitor(error);
    dashboard.footer = "Direct mode failed, session still active";
  }
}

async function captureCommandOutput(
  task: () => Promise<void>
): Promise<{ ok: true; output: string } | { ok: false; output: string; error: unknown }> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let buffer = "";

  const capture = (chunk: unknown, encoding?: BufferEncoding) => {
    buffer += toPlainText(chunk, encoding);
    return true;
  };

  process.stdout.write = capture as typeof process.stdout.write;
  process.stderr.write = capture as typeof process.stderr.write;

  try {
    await task();
    return { ok: true, output: buffer };
  } catch (error) {
    return { ok: false, output: buffer, error };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

function toPlainText(chunk: unknown, encoding?: BufferEncoding): string {
  let text = "";
  if (typeof chunk === "string") {
    text = chunk;
  } else if (chunk instanceof Uint8Array) {
    text = Buffer.from(chunk).toString(encoding ?? "utf-8");
  } else {
    text = String(chunk ?? "");
  }

  return stripAnsi(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function formatErrorMonitor(error: unknown, capturedOutput = ""): string[] {
  const message = error instanceof Error ? error.message : String(error);
  const lines = normalizeMonitorLines(capturedOutput);
  if (message && (!isCliError(error) || !error.handled)) {
    lines.push("");
    lines.push(`ERROR :: ${message}`);
  }

  return lines.length > 0 ? lines : ["Command failed without terminal output."];
}

function normalizeMonitorLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line, index, all) => line.length > 0 || (
      index > 0 &&
      index < all.length - 1 &&
      all[index - 1].length > 0
    ));

  return lines.length > 0 ? lines : ["(no output)"];
}

function reportCommandError(error: unknown): boolean {
  if (isAbortError(error)) {
    console.log(`\n${ANSI.dim}SESSION CLOSED${ANSI.reset}\n`);
    return false;
  }

  if (!isCliError(error) || !error.handled) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ ${message}\n`);
  }

  return false;
}

function exitWithError(error: unknown): never {
  if (!isCliError(error) || !error.handled) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ ${message}\n`);
  }

  process.exit(isCliError(error) ? error.exitCode : 1);
}

async function promptCommandMenu(dashboard: DashboardState): Promise<string | null> {
  const rl = createInterface({ input, output });

  try {
    while (true) {
      const promptRow = renderDashboard(dashboard);
      moveCursor(promptRow, 3);

      let answer = "";

      try {
        answer = (await rl.question(
          `${ANSI.green}${ANSI.bold}SELECT CHANNEL > ${ANSI.reset}`
        )).trim().toLowerCase();
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }

        throw error;
      }

      if (!answer) {
        dashboard.title = "INPUT REQUIRED";
        dashboard.lines = ["채널을 선택하세요: 1, 2, 3, 4, 5, 6 또는 Q"];
        dashboard.footer = "Waiting for valid input";
        continue;
      }

      const selected = MENU_CHOICES.find((choice) => choice.key === answer);
      if (selected) return selected.command;

      if (answer === "q" || answer === "quit" || answer === "exit") {
        return null;
      }

      dashboard.title = "INVALID CHANNEL";
      dashboard.lines = [`입력이 올바르지 않습니다: ${answer}`, "", "가능한 값: 1, 2, 3, 4, 5, 6, Q"];
      dashboard.footer = "Waiting for valid input";
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

function renderDashboard(state: DashboardState): number {
  const cols = Math.max(process.stdout.columns ?? 100, 80);
  const rows = Math.max(process.stdout.rows ?? 30, 24);
  const innerWidth = cols - 4;
  const headerLines = [
    `${ANSI.cyan}${ANSI.bold}KORE CHAMBER :: COMMAND CONSOLE${ANSI.reset}`,
    `${ANSI.dim}SOURCE :: CLAUDE JSONL${ANSI.reset}`,
    `${ANSI.dim}TARGET :: OBSIDIAN VAULT${ANSI.reset}`,
    `${ANSI.dim}STATUS :: ${hasConfig() ? "READY" : "INIT REQUIRED"}${ANSI.reset}`,
    `${ANSI.dim}MODE   :: SPLIT DASHBOARD${ANSI.reset}`,
  ];

  const commandRows = [
    "[1] INIT     [2] COLLECT   [3] EXPLORE",
    "[4] PROFILE  [5] STATUS    [6] DOCTOR    [Q] EXIT",
    state.footer,
  ];

  const fixedRows = headerLines.length + 2 + 2 + commandRows.length + 1;
  const monitorHeight = Math.max(8, rows - fixedRows);

  const screen: string[] = [];
  screen.push(...headerLines);
  screen.push(boxTop(`MONITOR :: ${state.title}`, innerWidth));

  const monitorLines = fitMonitorLines(state.lines, innerWidth - 2, monitorHeight);
  for (const line of monitorLines) {
    screen.push(boxLine(line, innerWidth));
  }

  screen.push(boxBottom(innerWidth));
  screen.push(boxTop("COMMAND DECK", innerWidth));
  screen.push(boxLine(commandRows[0], innerWidth));
  screen.push(boxLine(commandRows[1], innerWidth));
  screen.push(boxLine(commandRows[2], innerWidth));

  const promptRow = screen.length + 1;
  screen.push(boxLine("", innerWidth));
  screen.push(boxBottom(innerWidth));

  clearScreen();
  output.write(screen.join("\n"));
  return promptRow;
}

function fitMonitorLines(lines: string[], width: number, height: number): string[] {
  const wrapped = lines.flatMap((line) => wrapLine(line, width));
  const clipped = wrapped.slice(-height);

  while (clipped.length < height) {
    clipped.unshift("");
  }

  return clipped;
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [""];
  if (line.length === 0) return [""];

  const out: string[] = [];
  let remaining = line;

  while (remaining.length > width) {
    const slice = remaining.slice(0, width);
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > width / 3 ? lastSpace : width;
    out.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }

  out.push(remaining);
  return out;
}

function boxTop(title: string, innerWidth: number): string {
  const label = ` ${title} `;
  const fill = Math.max(innerWidth - label.length, 0);
  return `┌${label}${"─".repeat(fill)}┐`;
}

function boxBottom(innerWidth: number): string {
  return `└${"─".repeat(innerWidth)}┘`;
}

function boxLine(content: string, innerWidth: number): string {
  const visible = content.slice(0, innerWidth);
  return `│${visible.padEnd(innerWidth, " ")}│`;
}

function moveCursor(row: number, col: number) {
  output.write(`\x1b[${row};${col}H`);
}

function clearScreen() {
  output.write("\x1b[2J\x1b[H");
}

function shouldUsePassthrough(selectedCommand: string): boolean {
  if (selectedCommand === "init" || selectedCommand === "profile" || selectedCommand === "edit") {
    return true;
  }

  if ((selectedCommand === "collect" || selectedCommand === "explore") && !checkAuthStatus().loggedIn) {
    return true;
  }

  return false;
}

async function dispatch(
  selectedCommand: string,
  selectedArgs: string[],
  options: { interactive: boolean }
) {
  if (requiresSetup(selectedCommand) && !hasConfig()) {
    throw new CliError(
      "초기 설정이 없습니다. `kore-chamber`를 실행해 초기 설치를 완료하세요."
    );
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
    case "queue":
      await import("./queue.js").then((module) => module.runQueue(selectedArgs));
      break;
    case "context":
      await import("./context.js").then((module) => module.runContext(selectedArgs));
      break;
    case "hooks":
      await import("./hooks.js").then((module) => module.runHooks(selectedArgs));
      break;
    case "mcp":
      await import("../mcp/server.js");
      break;
    default:
      printHelp();
      throw new CliError("", { handled: true });
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
  console.log("  profile             init과 같은 질문형으로 MY-PROFILE.md 업데이트");
  console.log("  explore [topic]     볼트 갭 분석");
  console.log("  doctor              설치 상태 진단");
  console.log("  status              볼트 통계");
  console.log("  queue               자동 수집 queue 상태 확인/적재");
  console.log("  context             Claude hook용 세션 컨텍스트 생성");
  console.log("  hooks               Claude Code hooks 설치");
  console.log("  mcp                 MCP 서버 실행 (선택적 수동 사용)");
  console.log("");
  console.log("Collect options:");
  console.log("  --all               미처리 세션 전체 수집");
  console.log("  --dry-run           실제 저장 없이 계획만 표시");
  console.log("  --session <id>      특정 세션 JSONL 지정");
  console.log("  --transcript-path   특정 transcript JSONL 경로 지정");
  console.log("  --project-dir       transcript와 함께 프로젝트 디렉터리 힌트 지정");
  console.log("  --output <format>   json 또는 markdown (기본: markdown)");
  console.log("");
  console.log("Profile options:");
  console.log("  show                현재 MY-PROFILE.md 출력");
  console.log("  edit                고급: $EDITOR로 MY-PROFILE.md 직접 편집");
  console.log("");
  console.log("Queue options:");
  console.log("  enqueue             transcript를 자동 수집 queue에 적재");
  console.log("  show                queue 상태 출력");
  console.log("  worker              pending queue를 실제 collect로 처리");
  console.log("");
  console.log("Context options:");
  console.log("  session             SessionStart용 컨텍스트 생성");
  console.log("  prompt              UserPromptSubmit용 관련 노트 컨텍스트 생성");
  console.log("");
  console.log("Hooks options:");
  console.log("  install             SessionStart / UserPromptSubmit / SessionEnd hook 설치");
}
