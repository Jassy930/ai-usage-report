/** Claude Code 文件扫描器 — 适配真实 ~/.claude/ 格式 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FacetEntry, SessionMeta, JournalLine } from "./types";

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** 扫描 usage-data/facets/ — 每个文件是一个 JSON 对象（非数组） */
export async function scanFacets(claudeDir: string): Promise<FacetEntry[]> {
  const facetsDir = join(claudeDir, "usage-data", "facets");
  if (!(await dirExists(facetsDir))) return [];

  const files = await readdir(facetsDir);
  const entries: FacetEntry[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await Bun.file(join(facetsDir, file)).json();
      if (content && typeof content === "object" && !Array.isArray(content)) {
        // 真实格式：每个文件是一个对象，session_id 从文件名或 content.session_id 获取
        const entry = content as Record<string, unknown>;
        const sessionId =
          (entry.session_id as string) ?? file.replace(".json", "");
        entries.push({ ...entry, session_id: sessionId } as FacetEntry);
      }
    } catch {
      // 跳过无效文件
    }
  }

  return entries;
}

/** 扫描 usage-data/session-meta/ — 每个文件是一个 JSON 对象 */
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
      if (content && typeof content === "object") {
        entries.push(content as SessionMeta);
      }
    } catch {
      // 跳过无效文件
    }
  }

  return entries;
}

/** 扫描 projects/ 下所有 JSONL，返回按 sessionId 分组的行 */
export async function scanJournals(
  claudeDir: string,
): Promise<Map<string, JournalLine[]>> {
  const projectsDir = join(claudeDir, "projects");
  if (!(await dirExists(projectsDir))) return new Map();

  const sessionMap = new Map<string, JournalLine[]>();
  const projectDirs = await readdir(projectsDir);

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);

    let dirStat;
    try {
      dirStat = await stat(projPath);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

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
          try {
            const parsed = JSON.parse(line) as JournalLine;
            if (!parsed.sessionId) continue;
            // 只处理 user/assistant 类型
            if (parsed.type !== "user" && parsed.type !== "assistant") continue;

            let arr = sessionMap.get(parsed.sessionId);
            if (!arr) {
              arr = [];
              sessionMap.set(parsed.sessionId, arr);
            }
            arr.push(parsed);
          } catch {
            // 跳过无效行
          }
        }
      } catch {
        // 跳过无效文件
      }
    }

    // 也扫描 subagents 子目录
    const subagentsDir = join(projPath, "subagents");
    if (await dirExists(subagentsDir)) {
      // 扫描 {session-id}/subagents/ 下的 JSONL
    }
  }

  // 递归扫描 session 子目录 (projects/{path}/{sessionId}/*.jsonl)
  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);
    let dirStat;
    try {
      dirStat = await stat(projPath);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    let entries: string[];
    try {
      entries = await readdir(projPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(projPath, entry);
      let entryStat;
      try {
        entryStat = await stat(entryPath);
      } catch {
        continue;
      }
      if (!entryStat.isDirectory()) continue;

      // 这是一个 session 子目录
      let subFiles: string[];
      try {
        subFiles = await readdir(entryPath);
      } catch {
        continue;
      }

      for (const subFile of subFiles) {
        if (!subFile.endsWith(".jsonl")) continue;
        try {
          const text = await Bun.file(join(entryPath, subFile)).text();
          const lines = text
            .trim()
            .split("\n")
            .filter((l) => l.trim());

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as JournalLine;
              if (!parsed.sessionId) continue;
              if (parsed.type !== "user" && parsed.type !== "assistant")
                continue;

              let arr = sessionMap.get(parsed.sessionId);
              if (!arr) {
                arr = [];
                sessionMap.set(parsed.sessionId, arr);
              }
              arr.push(parsed);
            } catch {
              // 跳过无效行
            }
          }
        } catch {
          // 跳过无效文件
        }
      }
    }
  }

  return sessionMap;
}
