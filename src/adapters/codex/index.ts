/** Codex 采集器入口 */

import type { SessionRecord } from "../../core/types";
import { scanSessionFiles } from "./scanner";
import { parseSessionFile, loadHistoryPrompts, toSessionRecord } from "./parser";

export interface CodexCollectOptions {
  codexDir: string;
}

const CONCURRENCY = 32;

/**
 * 采集 Codex 会话数据，返回统一 SessionRecord[]
 */
export async function collectCodexSessions(
  options: CodexCollectOptions,
): Promise<SessionRecord[]> {
  const { codexDir } = options;

  const [files, promptMap] = await Promise.all([
    scanSessionFiles(codexDir),
    loadHistoryPrompts(codexDir),
  ]);

  const sessions: SessionRecord[] = [];

  // 分批并发解析
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ filePath, date }) => {
        const parsed = await parseSessionFile(filePath);
        if (!parsed.sessionId) return null;
        const firstPrompt = promptMap.get(parsed.sessionId);
        return toSessionRecord(parsed, date, firstPrompt);
      }),
    );
    for (const r of results) {
      if (r) sessions.push(r);
    }
  }

  return sessions;
}
