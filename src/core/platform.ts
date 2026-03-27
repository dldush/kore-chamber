import * as os from "node:os";

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
