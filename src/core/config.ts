import * as fs from "node:fs";
import * as path from "node:path";
import { parse as yamlParse } from "yaml";
import { homedir } from "./platform.js";
import { LATEST_CONFIG_VERSION } from "./migrate.js";
import type { DedupThresholds } from "./dedup.js";

const KORE_DIR = path.join(homedir(), ".kore-chamber");

export interface KoreConfig {
  vaultPath: string;
  dedup: DedupThresholds;
}

const DEFAULT_DEDUP: DedupThresholds = {
  clearNew: 0.30,
  clearDuplicate: 0.70,
};

export function loadConfig(): KoreConfig {
  const configPath = path.join(KORE_DIR, "config.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `설정 파일을 찾을 수 없습니다: ${configPath}\nnpx kore-chamber init을 먼저 실행하세요.`
    );
  }

  const raw = yamlParse(fs.readFileSync(configPath, "utf-8"));

  if (!raw?.vault_path) {
    throw new Error("config.yaml에 vault_path가 없습니다.");
  }

  const dedupRaw = raw.dedup as Record<string, number> | undefined;

  return {
    vaultPath: raw.vault_path,
    dedup: {
      clearNew: dedupRaw?.clear_new ?? DEFAULT_DEDUP.clearNew,
      clearDuplicate: dedupRaw?.clear_duplicate ?? DEFAULT_DEDUP.clearDuplicate,
    },
  };
}

export function getVaultPath(): string {
  return loadConfig().vaultPath;
}

export { LATEST_CONFIG_VERSION };
