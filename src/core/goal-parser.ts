import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { homedir } from "./platform.js";
import { queryLLM } from "../llm/claude.js";

// ─── Types ───

export interface GoalTopic {
  id: string;
  name: string;
  parentId?: string;
  sourceGoal: string;
  priority?: "high" | "medium" | "low";
}

interface GoalCache {
  profileHash: string;
  topics: GoalTopic[];
  generatedAt: string;
}

// ─── Constants ───

const CACHE_PATH = path.join(homedir(), ".kore-chamber", "goal-topics.json");

const GOAL_TOPICS_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "kebab-case identifier, e.g. react-query" },
          name: { type: "string", description: "human-readable name, e.g. React Query" },
          parentId: { type: "string", description: "parent topic id if this is a sub-topic" },
          sourceGoal: { type: "string", description: "the goal line this topic was derived from" },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high = directly stated goal, medium = important prerequisite, low = nice to have",
          },
        },
        required: ["id", "name", "sourceGoal"],
      },
    },
  },
  required: ["topics"],
};

// ─── Profile parsing ───

export function extractGoalsText(profile: string): string {
  const goalMatch = profile.match(/## 목표\n([\s\S]*?)(?=\n## |$)/);
  const interestMatch = profile.match(/## 깊이 파고 싶은 영역\n([\s\S]*?)(?=\n## |$)/);

  const parts: string[] = [];
  if (goalMatch?.[1]?.trim()) parts.push(goalMatch[1].trim());
  if (interestMatch?.[1]?.trim()) parts.push(interestMatch[1].trim());

  return parts.join("\n");
}

// ─── Cache ───

function loadCache(): GoalCache | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as GoalCache;
  } catch {
    return null;
  }
}

function saveCache(hash: string, topics: GoalTopic[]): void {
  const cache: GoalCache = {
    profileHash: hash,
    topics,
    generatedAt: new Date().toISOString().split("T")[0],
  };
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ─── Main ───

export async function parseGoalTopics(profile: string, force = false): Promise<GoalTopic[]> {
  const goalsText = extractGoalsText(profile);
  if (!goalsText) return [];

  const hash = crypto.createHash("sha256").update(goalsText).digest("hex").slice(0, 16);

  if (!force) {
    const cache = loadCache();
    if (cache?.profileHash === hash) return cache.topics;
  }

  const prompt = `You are a learning goal analyst. Given a user's stated learning goals, extract specific, learnable topics.

## User Goals
${goalsText}

## Instructions
- Break down each goal into concrete, learnable topics (technologies, concepts, skills)
- Each topic should be specific enough to check against a knowledge vault
- If a goal implies prerequisite knowledge, include those as medium/low priority topics
- Group related sub-topics under a parent topic using parentId
- id must be kebab-case (e.g. "react-query", "cs-network-basics")
- Aim for 8-15 topics total — not too broad, not too granular
- priority: high = directly stated goal, medium = important prerequisite, low = nice to have

Respond as JSON.`;

  const result = await queryLLM<{ topics: GoalTopic[] }>(prompt, GOAL_TOPICS_SCHEMA);
  const topics = result.topics ?? [];

  saveCache(hash, topics);
  return topics;
}

export function invalidateGoalCache(): void {
  if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
}
