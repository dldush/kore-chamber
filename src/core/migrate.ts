import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { homedir } from "./platform.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");
const CONFIG_PATH = path.join(KORE_DIR, "config.yaml");

// Current schema version — bump when adding a new migration
export const LATEST_CONFIG_VERSION = 3;

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
  {
    version: 3,
    description: "legacy history_paths 설정 제거",
    migrate: (config) => {
      delete config.history_paths;
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
