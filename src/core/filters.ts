/**
 * 会话记录过滤工具
 */

import type { SessionRecord, FilterOptions } from "./types";

/**
 * 根据过滤条件筛选会话记录
 *
 * @param sessions - 会话记录列表
 * @param options  - 过滤选项（均为可选）
 * @returns 符合条件的会话记录
 */
export function filterSessions(
  sessions: SessionRecord[],
  options: FilterOptions,
): SessionRecord[] {
  return sessions.filter((s) => {
    if (options.since) {
      const ts = new Date(s.timestamp);
      if (ts < options.since) return false;
    }

    if (options.tool) {
      if (s.tool !== options.tool) return false;
    }

    if (options.project) {
      const keyword = options.project.toLowerCase();
      const path = (s.projectPath ?? "").toLowerCase();
      if (!path.includes(keyword)) return false;
    }

    if (options.model) {
      const keyword = options.model.toLowerCase();
      const model = (s.model ?? "").toLowerCase();
      if (!model.includes(keyword)) return false;
    }

    return true;
  });
}
