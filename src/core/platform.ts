import * as os from "node:os";
import * as path from "node:path";

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
 * Detect system language. Returns "ko" for Korean, "en" otherwise.
 */
export function systemLang(): "ko" | "en" {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale.startsWith("ko")) return "ko";
  } catch { /* Intl not available */ }
  const env = process.env.LANG ?? process.env.LANGUAGE ?? "";
  if (env.startsWith("ko")) return "ko";
  return "en";
}
