/** Codex 采集器入口 */

import type { SessionRecord } from "../../core/types";
import { scanSessionFiles } from "./scanner";
import { parseSessionFile, loadHistoryPrompts, toSessionRecord } from "./parser";

export interface CodexCollectOptions {
  codexDir: string;
}

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

  for (const { filePath, date } of files) {
    const parsed = await parseSessionFile(filePath);
    if (!parsed.sessionId) continue;

    const firstPrompt = promptMap.get(parsed.sessionId);
    sessions.push(toSessionRecord(parsed, date, firstPrompt));
  }

  return sessions;
}
