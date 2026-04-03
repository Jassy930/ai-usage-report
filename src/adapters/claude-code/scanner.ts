/** Claude Code 文件扫描器 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FacetEntry, SessionMeta, JournalLine } from "./types";

async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(join(path, ".")).exists();
    // Bun.file on dir doesn't work well, use readdir instead
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/** 扫描 usage-data/facets/ 下所有 JSON，返回 FacetEntry[] */
export async function scanFacets(claudeDir: string): Promise<FacetEntry[]> {
  const facetsDir = join(claudeDir, "usage-data", "facets");
  if (!(await dirExists(facetsDir))) return [];

  const files = await readdir(facetsDir);
  const entries: FacetEntry[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await Bun.file(join(facetsDir, file)).json();
      if (Array.isArray(content)) {
        entries.push(...content);
      }
    } catch {
      // 跳过无效文件
    }
  }

  return entries;
}

/** 扫描 usage-data/session-meta/ 下所有 JSON，返回 SessionMeta[] */
export async function scanSessionMeta(
  claudeDir: string,
): Promise<SessionMeta[]> {
  const metaDir = join(claudeDir, "usage-data", "session-meta");
  if (!(await dirExists(metaDir))) return [];

  const files = await readdir(metaDir);
  const entries: SessionMeta[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await Bun.file(join(metaDir, file)).json();
      if (content && typeof content === "object" && content.sessionId) {
        entries.push(content as SessionMeta);
      }
    } catch {
      // 跳过无效文件
    }
  }

  return entries;
}

/** 扫描 projects/ 下所有 JSONL，返回解析后的行（按 sessionId 分组） */
export async function scanJournals(
  claudeDir: string,
): Promise<Map<string, JournalLine[]>> {
  const projectsDir = join(claudeDir, "projects");
  if (!(await dirExists(projectsDir))) return new Map();

  const sessionMap = new Map<string, JournalLine[]>();
  const projectDirs = await readdir(projectsDir);

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);
    let files: string[];
    try {
      files = await readdir(projPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      try {
        const text = await Bun.file(join(projPath, file)).text();
        const lines = text
          .trim()
          .split("\n")
          .filter((l) => l.trim());

        for (const line of lines) {
          const parsed = JSON.parse(line) as JournalLine;
          if (!parsed.sessionId) continue;

          let arr = sessionMap.get(parsed.sessionId);
          if (!arr) {
            arr = [];
            sessionMap.set(parsed.sessionId, arr);
          }
          arr.push(parsed);
        }
      } catch {
        // 跳过无效文件
      }
    }
  }

  return sessionMap;
}
