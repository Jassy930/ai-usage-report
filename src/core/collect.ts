/**
 * 统一采集入口
 *
 * 聚合多个工具的会话数据，支持工具选择与过滤。
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionRecord, ToolType, FilterOptions } from "./types";
import { filterSessions } from "./filters";
import { parseDateInput, parseDateEndInput, parseSinceSpec } from "./time";
import { collectCodexSessions } from "../adapters/codex";
import { collectClaudeCodeSessions } from "../adapters/claude-code";

/** collectAllSessions 的选项 */
export interface CollectOptions {
  /** 要采集的工具列表，默认采集全部 */
  tools?: ToolType[];
  /** 数据目录覆盖 */
  roots?: {
    codexDir?: string;
    claudeDir?: string;
  };
  /** 时间范围规格，如 "7d", "1m", "1y" */
  since?: string;
  /** 结束日期，支持 YYYY-MM-DD */
  until?: string;
  /** 项目路径关键字过滤 */
  project?: string;
  /** 模型名称关键字过滤 */
  model?: string;
}

const ALL_TOOLS: ToolType[] = ["codex", "claude-code"];

export function compareSessionsByTimestampDesc(
  a: Pick<SessionRecord, "timestamp">,
  b: Pick<SessionRecord, "timestamp">,
): number {
  const aTime = Date.parse(a.timestamp);
  const bTime = Date.parse(b.timestamp);

  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return b.timestamp.localeCompare(a.timestamp);
  }

  return bTime - aTime;
}

/**
 * 统一采集所有会话，支持工具选择与过滤
 *
 * @param options - 采集选项
 * @returns 按时间降序排列的 SessionRecord[]
 */
export async function collectAllSessions(
  options: CollectOptions = {},
): Promise<SessionRecord[]> {
  const tools = options.tools?.length ? options.tools : ALL_TOOLS;
  const home = homedir();
  const codexDir = options.roots?.codexDir ?? join(home, ".codex");
  const claudeDir = options.roots?.claudeDir ?? join(home, ".claude");

  // 并行采集
  const tasks: Promise<SessionRecord[]>[] = [];

  if (tools.includes("codex")) {
    tasks.push(collectCodexSessions({ codexDir }));
  }
  if (tools.includes("claude-code")) {
    tasks.push(collectClaudeCodeSessions({ claudeDir }));
  }

  const results = await Promise.all(tasks);
  let sessions = results.flat();

  // 构建过滤选项
  const filterOpts: FilterOptions = {};

  if (options.since) {
    filterOpts.since = /^\d{4}-\d{2}-\d{2}$/.test(options.since)
      ? parseDateInput(options.since)
      : parseSinceSpec(options.since);
  }
  if (options.until) {
    filterOpts.until = parseDateEndInput(options.until);
  }
  if (options.project) {
    filterOpts.project = options.project;
  }
  if (options.model) {
    filterOpts.model = options.model;
  }

  sessions = filterSessions(sessions, filterOpts);

  // 按时间降序排序
  sessions.sort(compareSessionsByTimestampDesc);

  return sessions;
}
