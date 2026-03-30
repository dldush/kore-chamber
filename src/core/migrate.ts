import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { homedir } from "./platform.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
const CONFIG_PATH = path.join(KORE_DIR, "config.yaml");

// Current schema version — bump when adding a new migration
export const LATEST_CONFIG_VERSION = 2;

interface Migration {
  version: number;
  description: string;
  migrate: (config: Record<string, unknown>, vaultPath: string | null) => void;
}

/**
 * Migration registry. Each entry upgrades config from (version-1) → version.
 * Migrations run sequentially in order.
 */
const migrations: Migration[] = [
  {
    version: 2,
    description: "dedup 임계값 설정 추가",
    migrate: (config) => {
      if (!config.dedup) {
        config.dedup = {
          clear_new: 0.30,
          clear_duplicate: 0.70,
        };
      }
    },
  },
];

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
}

/**
 * Run all pending migrations on config.yaml.
 * Returns what was applied, or null if config doesn't exist.
 */
export function runMigrations(): MigrationResult | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config: Record<string, unknown> = yamlParse(raw) || {};

  const currentVersion = typeof config.config_version === "number"
    ? config.config_version
    : 1;

  if (currentVersion >= LATEST_CONFIG_VERSION) {
    return { from: currentVersion, to: currentVersion, applied: [] };
  }

  const vaultPath = typeof config.vault_path === "string" ? config.vault_path : null;
  const applied: string[] = [];

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      migration.migrate(config, vaultPath);
      applied.push(`v${migration.version}: ${migration.description}`);
    }
  }

  config.config_version = LATEST_CONFIG_VERSION;
  fs.writeFileSync(CONFIG_PATH, yamlStringify(config));

  return { from: currentVersion, to: LATEST_CONFIG_VERSION, applied };
}

/**
 * Check if config needs migration. Prints a notice if outdated.
 * Call at the start of CLI commands so Claude Code skills can detect it.
 */
export function checkPendingMigrations(): boolean {
  if (!fs.existsSync(CONFIG_PATH)) return false;

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config: Record<string, unknown> = yamlParse(raw) || {};
    const currentVersion = typeof config.config_version === "number"
      ? config.config_version
      : 1;

    if (currentVersion < LATEST_CONFIG_VERSION) {
      console.log(
        `\n⚠️  [UPDATE AVAILABLE] Kore Chamber 설정이 최신 버전이 아닙니다 (v${currentVersion} → v${LATEST_CONFIG_VERSION}).`
        + `\n   "npx kore-chamber update"를 실행하면 새로운 설정이 자동으로 적용됩니다.\n`
      );
      return true;
    }
  } catch {
    // Ignore parse errors — doctor will catch them
  }

  return false;
}
