/** Claude Code 采集器入口 */

import type { SessionRecord } from "../../core/types";
import { scanFacets, scanSessionMeta, scanJournals } from "./scanner";
import { mergeAllSources } from "./parser";

export interface ClaudeCodeCollectOptions {
  claudeDir: string;
}

/**
 * 采集 Claude Code 会话数据，返回统一 SessionRecord[]
 */
export async function collectClaudeCodeSessions(
  options: ClaudeCodeCollectOptions,
): Promise<SessionRecord[]> {
  const { claudeDir } = options;

  const [facets, metas, journals] = await Promise.all([
    scanFacets(claudeDir),
    scanSessionMeta(claudeDir),
    scanJournals(claudeDir),
  ]);

  return mergeAllSources(journals, facets, metas);
}
