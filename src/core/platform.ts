import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Cross-platform home directory.
 * Works on macOS/Linux (HOME) and Windows (USERPROFILE).
 */
export function homedir(): string {
  return os.homedir();
}

/**
 * Command to locate an executable.
 * `which` on Unix, `where` on Windows.
 */
export function whichCommand(bin: string): string {
  return process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
}

/**
 * Default vault path: ~/Documents/KoreChamber
 */
export function defaultVaultPath(): string {
  return path.join(os.homedir(), "Documents", "KoreChamber");
}

/**
 * Returns true if kore-chamber is running from a temporary npx cache path.
 * Such paths are not stable enough for hook automation (the executable may disappear).
 */
export function isEphemeralInstall(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;

  let resolved = entry;
  try {
    resolved = fs.realpathSync(path.resolve(entry));
  } catch { /* fall back to original path */ }

  return (
    resolved.includes(`${path.sep}.npm${path.sep}_npx${path.sep}`) ||
    resolved.includes(`${path.sep}.npm${path.sep}_cacache${path.sep}`) ||
    resolved.includes(`${path.sep}npm-cache${path.sep}_npx${path.sep}`)
  );
}

/**
 * Detect system language. Returns "ko" for Korean, "en" otherwise.
 * Priority: macOS AppleLanguages > LANG env > Intl
 */
export function systemLang(): "ko" | "en" {
  // macOS: check display language via defaults (independent of terminal LANG)
  if (process.platform === "darwin") {
    try {
      const out = execSync("defaults read -g AppleLanguages", {
        timeout: 2000,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
      if (/\bko\b/.test(out)) return "ko";
    } catch { /* defaults not available */ }
  }

  // LANG / LANGUAGE env vars
  const env = process.env.LANG ?? process.env.LANGUAGE ?? "";
  if (env.startsWith("ko")) return "ko";

  // Intl fallback
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale.startsWith("ko")) return "ko";
  } catch { /* Intl not available */ }

  return "en";
}
