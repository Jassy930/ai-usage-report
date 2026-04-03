/** Codex 会话目录扫描器 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * 扫描 sessions/YYYY/MM/DD/*.jsonl，返回所有 JSONL 文件路径及对应日期
 */
export async function scanSessionFiles(
  codexDir: string,
): Promise<Array<{ filePath: string; date: string }>> {
  const sessionsDir = join(codexDir, "sessions");
  const results: Array<{ filePath: string; date: string }> = [];

  let years: string[];
  try {
    years = await readdir(sessionsDir);
  } catch {
    return results;
  }

  for (const year of years) {
    const yearPath = join(sessionsDir, year);
    if (!(await isDir(yearPath))) continue;

    let months: string[];
    try {
      months = await readdir(yearPath);
    } catch {
      continue;
    }

    for (const month of months) {
      const monthPath = join(yearPath, month);
      if (!(await isDir(monthPath))) continue;

      let days: string[];
      try {
        days = await readdir(monthPath);
      } catch {
        continue;
      }

      for (const day of days) {
        const dayPath = join(monthPath, day);
        if (!(await isDir(dayPath))) continue;

        let files: string[];
        try {
          files = await readdir(dayPath);
        } catch {
          continue;
        }

        for (const file of files) {
          if (file.endsWith(".jsonl")) {
            results.push({
              filePath: join(dayPath, file),
              date: `${year}-${month}-${day}`,
            });
          }
        }
      }
    }
  }

  return results;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
