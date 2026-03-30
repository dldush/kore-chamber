import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getAllSummaries,
  readNote,
  readProfile,
  listNotes,
  touchLastReferenced,
  getFreshness,
  type NoteSummary,
} from "../core/vault.js";
import { searchRelated } from "../core/linker.js";
import { findBestMOC, getMOCNotes, countMOCLinks } from "../core/moc.js";
import { tokenize, jaccardSimilarity } from "../core/dedup.js";

export function registerTools(server: McpServer, vaultPath: string): void {
  // ─── kc_search ───

  server.registerTool(
    "kc_search",
    {
      title: "Knowledge Search",
      description:
        "Search the knowledge vault by text query. Returns notes ranked by similarity, weighted by confidence. Use this when the user's question relates to a topic that might already be in their vault.",
      inputSchema: z.object({
        query: z.string().describe("Search query text (Korean or English)"),
        limit: z.number().optional().describe("Max results (default 5)"),
      }),
    },
    async ({ query, limit }) => {
      const maxResults = limit ?? 5;
      const summaries = getAllSummaries(vaultPath);
      const queryTokens = tokenize(query);

      const ranked = summaries
        .map((note) => {
          const noteTokens = tokenize(note.summary);
          const similarity = jaccardSimilarity(queryTokens, noteTokens);
          const score = similarity * (0.7 + 0.3 * note.confidence);
          return { ...note, similarity, score };
        })
        .filter((n) => n.similarity > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      const results = ranked.map((n) => ({
        slug: n.slug,
        type: n.type,
        summary: n.summary,
        tags: n.tags,
        similarity: +n.similarity.toFixed(3),
        confidence: n.confidence,
        score: +n.score.toFixed(3),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text:
              results.length > 0
                ? JSON.stringify(results, null, 2)
                : "No matching notes found.",
          },
        ],
      };
    }
  );

  // ─── kc_read ───

  server.registerTool(
    "kc_read",
    {
      title: "Read Note",
      description:
        "Read the full content of a vault note by slug. Updates last_referenced timestamp. Use after kc_search to get the full details of a relevant note.",
      inputSchema: z.object({
        slug: z.string().describe("Note slug (filename without .md)"),
      }),
    },
    async ({ slug }) => {
      const summaries = getAllSummaries(vaultPath);
      const match = summaries.find((n) => n.slug === slug);

      if (!match) {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${slug}` }],
        };
      }

      const note = readNote(match.path);
      if (!note) {
        return {
          content: [
            { type: "text" as const, text: `Failed to read: ${match.path}` },
          ],
        };
      }

      touchLastReferenced(match.path);

      const header = [
        `slug: ${slug}`,
        `type: ${note.frontmatter.type}`,
        `tags: ${note.frontmatter.tags.join(", ")}`,
        `created: ${note.frontmatter.created}`,
        `confidence: ${(note.frontmatter.confidence as number) ?? 0.5}`,
        `freshness: ${getFreshness(note.frontmatter)}`,
        `summary: ${note.frontmatter.summary}`,
      ].join("\n");

      return {
        content: [
          { type: "text" as const, text: `---\n${header}\n---\n${note.body}` },
        ],
      };
    }
  );

  // ─── kc_profile ───

  server.registerTool(
    "kc_profile",
    {
      title: "User Profile",
      description:
        "Read the user's MY-PROFILE.md from the vault. Contains their role, goals, preferences, and skill levels. Read this to personalize responses.",
      inputSchema: z.object({}),
    },
    async () => {
      const profile = readProfile(vaultPath);
      return {
        content: [
          {
            type: "text" as const,
            text: profile || "No profile found (MY-PROFILE.md missing).",
          },
        ],
      };
    }
  );

  // ─── kc_related ───

  server.registerTool(
    "kc_related",
    {
      title: "Related Notes",
      description:
        "Find notes related to a given note using Spreading Activation (tag overlap, link traversal, MOC neighbors). Use after reading a note to explore connected knowledge.",
      inputSchema: z.object({
        slug: z.string().describe("Source note slug"),
      }),
    },
    async ({ slug }) => {
      const summaries = getAllSummaries(vaultPath);
      const source = summaries.find((n) => n.slug === slug);

      if (!source) {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${slug}` }],
        };
      }

      const mocPath = findBestMOC(vaultPath, source.tags);
      const related = searchRelated(
        slug,
        source.tags,
        source.summary,
        summaries,
        mocPath
      );

      const results = related.map((r) => {
        const note = summaries.find((n) => n.slug === r.slug);
        return {
          slug: r.slug,
          weight: r.weight,
          reason: r.reason,
          type: note?.type ?? "",
          summary: note?.summary ?? "",
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              results.length > 0
                ? JSON.stringify(results, null, 2)
                : "No related notes found.",
          },
        ],
      };
    }
  );

  // ─── kc_status ───

  server.registerTool(
    "kc_status",
    {
      title: "Vault Status",
      description:
        "Get vault statistics: note counts by type, freshness distribution, and overall health.",
      inputSchema: z.object({}),
    },
    async () => {
      const summaries = getAllSummaries(vaultPath);
      const allPaths = listNotes(vaultPath);

      const byType: Record<string, number> = {};
      const byFreshness: Record<string, number> = {
        current: 0,
        aging: 0,
        stale: 0,
      };

      for (const notePath of allPaths) {
        const note = readNote(notePath);
        if (!note) continue;
        const t = note.frontmatter.type || "inbox";
        byType[t] = (byType[t] || 0) + 1;
        byFreshness[getFreshness(note.frontmatter)]++;
      }

      const stats = {
        totalNotes: allPaths.length,
        byType,
        byFreshness,
        averageConfidence: summaries.length > 0
          ? +(
              summaries.reduce((sum, n) => sum + n.confidence, 0) /
              summaries.length
            ).toFixed(2)
          : 0,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
      };
    }
  );

  // ─── kc_moc_list ───

  server.registerTool(
    "kc_moc_list",
    {
      title: "List MOCs",
      description:
        "List all Maps of Content (MOC) files in the vault with their link counts.",
      inputSchema: z.object({}),
    },
    async () => {
      const mocDir = path.join(vaultPath, "50-MOC");
      if (!fs.existsSync(mocDir)) {
        return {
          content: [{ type: "text" as const, text: "No MOC directory found." }],
        };
      }

      const mocFiles = fs
        .readdirSync(mocDir)
        .filter((f) => f.startsWith("MOC-") && f.endsWith(".md"));

      const mocs = mocFiles.map((f) => {
        const fullPath = path.join(mocDir, f);
        return {
          name: f.replace(".md", ""),
          linkCount: countMOCLinks(fullPath),
        };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(mocs, null, 2) }],
      };
    }
  );

  // ─── kc_moc_read ───

  server.registerTool(
    "kc_moc_read",
    {
      title: "Read MOC",
      description:
        "Read a specific MOC file and return all linked note slugs with their summaries.",
      inputSchema: z.object({
        name: z
          .string()
          .describe('MOC name (e.g. "MOC-데이터베이스" or "MOC-프론트엔드")'),
      }),
    },
    async ({ name }) => {
      const mocFile = name.endsWith(".md") ? name : `${name}.md`;
      const mocPath = path.join(vaultPath, "50-MOC", mocFile);

      if (!fs.existsSync(mocPath)) {
        return {
          content: [
            { type: "text" as const, text: `MOC not found: ${mocFile}` },
          ],
        };
      }

      const slugs = getMOCNotes(mocPath);
      const summaries = getAllSummaries(vaultPath);

      const notes = slugs.map((slug) => {
        const note = summaries.find((n) => n.slug === slug);
        return {
          slug,
          type: note?.type ?? "unknown",
          summary: note?.summary ?? "",
          confidence: note?.confidence ?? 0.5,
        };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(notes, null, 2) }],
      };
    }
  );
}
