import * as fs from "node:fs";
import * as path from "node:path";
import { getFreshness, readNote, type Freshness, type NoteType, type NoteSummary } from "./vault.js";
import { getMOCNotes } from "./moc.js";
import type { GoalTopic } from "./goal-parser.js";

// ─── Types ───

export interface TopicCoverage {
  topic: GoalTopic;
  noteCount: number;
  typeBreakdown: Partial<Record<NoteType, number>>;
  typeVariety: number;
  linkedFromMOC: boolean;
  mocNames: string[];
  backlinks: number;
  maxConfidence: number;
  avgFreshness: Freshness | "none";
  isolated: boolean;
}

// ─── Matching ───

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_\s.]+/g, "");
}

function topicMatchesNote(topic: GoalTopic, summary: NoteSummary): boolean {
  const topicNorm = normalize(topic.name);
  const topicIdNorm = normalize(topic.id);

  for (const tag of summary.tags) {
    const tagNorm = normalize(tag);
    if (tagNorm.includes(topicNorm) || topicNorm.includes(tagNorm)) return true;
    if (tagNorm.includes(topicIdNorm) || topicIdNorm.includes(tagNorm)) return true;
  }

  const slugNorm = normalize(summary.slug);
  if (slugNorm.includes(topicNorm) || slugNorm.includes(topicIdNorm)) return true;

  return false;
}

// ─── Freshness helpers ───

function freshnessToScore(f: Freshness): number {
  return f === "current" ? 2 : f === "aging" ? 1 : 0;
}

function scoreToFreshness(score: number): Freshness {
  if (score >= 1.5) return "current";
  if (score >= 0.75) return "aging";
  return "stale";
}

// ─── Main ───

export function collectVaultCoverage(
  topics: GoalTopic[],
  summaries: NoteSummary[],
  mocDir: string
): TopicCoverage[] {
  // Build MOC membership map: noteSlug → mocName
  const mocNoteMap = new Map<string, string>();
  if (fs.existsSync(mocDir)) {
    for (const file of fs.readdirSync(mocDir)) {
      if (!file.startsWith("MOC-") || !file.endsWith(".md")) continue;
      const mocName = file.replace("MOC-", "").replace(".md", "");
      for (const slug of getMOCNotes(path.join(mocDir, file))) {
        mocNoteMap.set(slug, mocName);
      }
    }
  }

  // Build backlink count: noteSlug → number of notes that link to it
  const backlinkCount = new Map<string, number>();
  for (const s of summaries) {
    for (const link of s.links) {
      backlinkCount.set(link, (backlinkCount.get(link) ?? 0) + 1);
    }
  }

  return topics.map((topic): TopicCoverage => {
    const matching = summaries.filter((s) => topicMatchesNote(topic, s));

    if (matching.length === 0) {
      return {
        topic,
        noteCount: 0,
        typeBreakdown: {},
        typeVariety: 0,
        linkedFromMOC: false,
        mocNames: [],
        backlinks: 0,
        maxConfidence: 0,
        avgFreshness: "none",
        isolated: true,
      };
    }

    const typeBreakdown: Partial<Record<NoteType, number>> = {};
    let maxConfidence = 0;
    let freshnessSum = 0;
    const mocNames: string[] = [];
    let totalBacklinks = 0;
    let allIsolated = true;

    for (const s of matching) {
      typeBreakdown[s.type] = (typeBreakdown[s.type] ?? 0) + 1;
      maxConfidence = Math.max(maxConfidence, s.confidence);

      const note = readNote(s.path);
      if (note) {
        freshnessSum += freshnessToScore(getFreshness(note.frontmatter));
      }

      const moc = mocNoteMap.get(s.slug);
      if (moc && !mocNames.includes(moc)) mocNames.push(moc);

      totalBacklinks += backlinkCount.get(s.slug) ?? 0;
      if (s.links.length > 0) allIsolated = false;
    }

    return {
      topic,
      noteCount: matching.length,
      typeBreakdown,
      typeVariety: Object.keys(typeBreakdown).length,
      linkedFromMOC: mocNames.length > 0,
      mocNames,
      backlinks: totalBacklinks,
      maxConfidence,
      avgFreshness: scoreToFreshness(freshnessSum / matching.length),
      isolated: allIsolated,
    };
  });
}
