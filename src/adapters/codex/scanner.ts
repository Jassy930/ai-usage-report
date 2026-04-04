/** Codex 会话目录扫描器 */

import { Glob } from "bun";
import { join } from "node:path";

/**
 * 扫描 sessions/YYYY/MM/DD/*.jsonl，返回所有 JSONL 文件路径及对应日期
 */
export async function scanSessionFiles(
  codexDir: string,
): Promise<Array<{ filePath: string; date: string }>> {
  const sessionsDir = join(codexDir, "sessions");
  const glob = new Glob("*/*/*/*.jsonl");
  const results: Array<{ filePath: string; date: string }> = [];

  try {
    for await (const match of glob.scan({ cwd: sessionsDir, absolute: true })) {
      // match: /path/to/sessions/2026/04/03/abc.jsonl
      const parts = match.split("/");
      const len = parts.length;
      const date = `${parts[len - 4]}-${parts[len - 3]}-${parts[len - 2]}`;
      results.push({ filePath: match, date });
    }
  } catch {
    // sessions 目录不存在
  }

  return results;
}
