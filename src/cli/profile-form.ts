import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { systemLang } from "../core/platform.js";

export type Lang = "ko" | "en";

export interface ProfileAnswers {
  field: string;
  level: string;
  goal: string;
  learningStyle: string;
  deepInterest: string;
  notes: string;
}

const DEFAULT_NOTES = "(자유롭게 추가하세요)";

const QUESTIONS = {
  ko: [
    "[1/5] 공부하거나 일하는 분야",
    "[2/5] 현재 수준",
    "[3/5] 목표",
    "[4/5] 학습 스타일",
    "[5/5] 깊이 파고 싶은 영역",
  ],
  en: [
    "[1/5] Your field",
    "[2/5] Current level",
    "[3/5] Goal",
    "[4/5] Learning style",
    "[5/5] Area to go deep on",
  ],
} as const;

const SECTION_TITLES = {
  field: "## 분야",
  level: "## 현재 수준",
  goal: "## 목표",
  learningStyle: "## 학습 스타일",
  deepInterest: "## 깊이 파고 싶은 영역",
  notes: "## 메모",
} as const;

export function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const onClose = () => {
      rl.off("SIGINT", onSigint);
      reject(new Error("입력이 중단되었습니다."));
    };

    const onSigint = () => {
      rl.off("close", onClose);
      reject(new Error("입력이 중단되었습니다."));
    };

    rl.once("close", onClose);
    rl.once("SIGINT", onSigint);

    rl.question(question, (answer) => {
      rl.off("close", onClose);
      rl.off("SIGINT", onSigint);
      resolve(answer.trim());
    });
  });
}

export function detectProfileLang(): Lang {
  return systemLang();
}

export function buildProfileContent(answers: ProfileAnswers): string {
  return [
    "# MY-PROFILE",
    "",
    SECTION_TITLES.field,
    answers.field || "(미입력)",
    "",
    SECTION_TITLES.level,
    answers.level || "(미입력)",
    "",
    SECTION_TITLES.goal,
    answers.goal || "(미입력)",
    "",
    SECTION_TITLES.learningStyle,
    answers.learningStyle || "(미입력)",
    "",
    SECTION_TITLES.deepInterest,
    answers.deepInterest || "(미입력)",
    "",
    SECTION_TITLES.notes,
    answers.notes?.trim() || DEFAULT_NOTES,
    "",
  ].join("\n");
}

export function parseProfileContent(content: string): ProfileAnswers {
  return {
    field: extractSection(content, SECTION_TITLES.field),
    level: extractSection(content, SECTION_TITLES.level),
    goal: extractSection(content, SECTION_TITLES.goal),
    learningStyle: extractSection(content, SECTION_TITLES.learningStyle),
    deepInterest: extractSection(content, SECTION_TITLES.deepInterest),
    notes: extractSection(content, SECTION_TITLES.notes) || DEFAULT_NOTES,
  };
}

export function readProfileAnswers(profilePath: string): ProfileAnswers {
  if (!fs.existsSync(profilePath)) {
    return {
      field: "",
      level: "",
      goal: "",
      learningStyle: "",
      deepInterest: "",
      notes: DEFAULT_NOTES,
    };
  }

  return parseProfileContent(fs.readFileSync(profilePath, "utf-8"));
}

export function writeProfile(profilePath: string, answers: ProfileAnswers) {
  fs.writeFileSync(profilePath, buildProfileContent(answers));
}

export async function promptProfileAnswers(
  rl: readline.Interface,
  lang: Lang,
  current?: Partial<ProfileAnswers>
): Promise<ProfileAnswers> {
  const prompts = QUESTIONS[lang];

  const field = await promptWithDefault(rl, prompts[0], current?.field);
  const level = await promptWithDefault(rl, prompts[1], current?.level);
  const goal = await promptWithDefault(rl, prompts[2], current?.goal);
  const learningStyle = await promptWithDefault(rl, prompts[3], current?.learningStyle);
  const deepInterest = await promptWithDefault(rl, prompts[4], current?.deepInterest);

  return {
    field,
    level,
    goal,
    learningStyle,
    deepInterest,
    notes: current?.notes?.trim() || DEFAULT_NOTES,
  };
}

export function getProfilePath(vaultPath: string): string {
  return path.join(vaultPath, "MY-PROFILE.md");
}

async function promptWithDefault(
  rl: readline.Interface,
  label: string,
  currentValue?: string
): Promise<string> {
  const prompt = currentValue && currentValue.length > 0
    ? `\n${label}\n      현재값: ${currentValue}\n      엔터 = 유지\n      > `
    : `\n${label}\n      > `;

  const answer = await askQuestion(rl, prompt);
  return answer || currentValue || "";
}

function extractSection(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() ?? "";
}
