/** Claude Code 文件扫描器 — 适配真实 ~/.claude/ 格式 */

import { Glob } from "bun";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FacetEntry, SessionMeta, JournalLine } from "./types";

const BATCH_SIZE = 64;

/** 扫描 usage-data/facets/ — 每个文件是一个 JSON 对象（非数组） */
export async function scanFacets(claudeDir: string): Promise<FacetEntry[]> {
  const facetsDir = join(claudeDir, "usage-data", "facets");
  let files: string[];
  try {
    files = await readdir(facetsDir);
  } catch {
    return [];
  }

  const entries: FacetEntry[] = [];
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const filePath = resolve(join(facetsDir, file));
          const content = await Bun.file(filePath).json();
          if (content && typeof content === "object" && !Array.isArray(content)) {
            const entry = content as Record<string, unknown>;
            const sessionId =
              (entry.session_id as string) ?? file.replace(".json", "");
            return { ...entry, session_id: sessionId, __source: { filePath } } as FacetEntry;
          }
        } catch {
          // 跳过无效文件
        }
        return null;
      }),
    );
    for (const r of results) {
      if (r) entries.push(r);
    }
  }

  return entries;
}

/** 扫描 usage-data/session-meta/ — 每个文件是一个 JSON 对象 */
export async function scanSessionMeta(
  claudeDir: string,
): Promise<SessionMeta[]> {
  const metaDir = join(claudeDir, "usage-data", "session-meta");
  let files: string[];
  try {
    files = await readdir(metaDir);
  } catch {
    return [];
  }

  const entries: SessionMeta[] = [];
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const filePath = resolve(join(metaDir, file));
          const content = await Bun.file(filePath).json();
          if (content && typeof content === "object") {
            return {
              ...(content as SessionMeta),
              __source: { filePath },
            } as SessionMeta;
          }
        } catch {
          // 跳过无效文件
        }
        return null;
      }),
    );
    for (const r of results) {
      if (r) entries.push(r);
    }
  }

  return entries;
}

/** 扫描 projects/ 下所有 JSONL，返回按 sessionId 分组的行 */
export async function scanJournals(
  claudeDir: string,
): Promise<Map<string, JournalLine[]>> {
  const projectsDir = join(claudeDir, "projects");
  const sessionMap = new Map<string, JournalLine[]>();
  const glob = new Glob("**/*.jsonl");

  let matches: string[];
  try {
    matches = [];
    for await (const match of glob.scan({ cwd: projectsDir, absolute: true })) {
      matches.push(match);
    }
  } catch {
    return sessionMap;
  }

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const lines: JournalLine[] = [];
        try {
          const text = await Bun.file(filePath).text();
          for (const [index, line] of text.split("\n").entries()) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as JournalLine;
              if (!parsed.sessionId) continue;
              if (parsed.type !== "user" && parsed.type !== "assistant") continue;
              lines.push({
                ...parsed,
                __source: {
                  filePath,
                  line: index + 1,
                },
              });
            } catch {
              // 跳过无效行
            }
          }
        } catch {
          // 跳过无效文件
        }
        return lines;
      }),
    );

    for (const lines of results) {
      for (const parsed of lines) {
        let arr = sessionMap.get(parsed.sessionId);
        if (!arr) {
          arr = [];
          sessionMap.set(parsed.sessionId, arr);
        }
        arr.push(parsed);
      }
    }
  }

  return sessionMap;
}
