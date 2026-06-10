/**
 * 会话记录过滤工具
 */

import type { SessionRecord, SessionMessage, TokenBreakdown, FilterOptions } from "./types";

function inRange(time: number, since?: Date, until?: Date): boolean {
  if (Number.isNaN(time)) return false;
  if (since && time < since.getTime()) return false;
  if (until && time > until.getTime()) return false;
  return true;
}

/**
 * 按消息时间戳把 token 用量裁剪到时间窗口内（按请求实际发生时间逐条累加）
 */
function clipBreakdown(messages: SessionMessage[], since?: Date, until?: Date): TokenBreakdown {
  const bd: TokenBreakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    total: 0,
  };
  for (const m of messages) {
    if (!m.usage) continue;
    if (!inRange(Date.parse(m.timestamp), since, until)) continue;
    bd.inputTokens += m.usage.input_tokens ?? 0;
    bd.outputTokens += m.usage.output_tokens ?? 0;
    bd.cacheReadTokens += m.usage.cache_read_input_tokens ?? 0;
    bd.cacheWriteTokens += m.usage.cache_creation_input_tokens ?? 0;
  }
  bd.total = bd.inputTokens + bd.outputTokens + bd.cacheReadTokens + bd.cacheWriteTokens;
  return bd;
}

/**
 * 根据过滤条件筛选会话记录
 *
 * 时间过滤采用"按请求实际发生时间"归属：
 * - 会话消息带有 usage 时，逐条按消息时间戳判断是否落在 [since, until] 窗口内，
 *   跨天会话会被裁剪出窗口内的实际用量（tokenBreakdown / messageCount 重新计算）；
 * - 消息无 usage 数据时，回退为按会话开始时间整体取舍（旧行为）。
 *
 * @param sessions - 会话记录列表
 * @param options  - 过滤选项（均为可选）
 * @returns 符合条件的会话记录
 */
export function filterSessions(
  sessions: SessionRecord[],
  options: FilterOptions,
): SessionRecord[] {
  const projectKeyword = options.project?.toLowerCase();
  const modelKeyword = options.model?.toLowerCase();
  const { since, until } = options;

  const results: SessionRecord[] = [];

  for (const s of sessions) {
    if (options.tool && s.tool !== options.tool) continue;

    if (projectKeyword) {
      const path = (s.projectPath ?? "").toLowerCase();
      if (!path.includes(projectKeyword)) continue;
    }

    if (modelKeyword) {
      const model = (s.model ?? "").toLowerCase();
      if (!model.includes(modelKeyword)) continue;
    }

    if (!since && !until) {
      results.push(s);
      continue;
    }

    const startInRange = inRange(Date.parse(s.timestamp), since, until);
    const usageMessages = s.messages.filter((m) => m.usage);

    // 无逐条 usage 数据：按会话开始时间整体取舍
    if (usageMessages.length === 0) {
      if (startInRange) results.push(s);
      continue;
    }

    const usageInRange = usageMessages.filter((m) =>
      inRange(Date.parse(m.timestamp), since, until),
    );

    // 窗口内无任何请求，且会话也不是在窗口内启动 → 排除
    if (usageInRange.length === 0 && !startInRange) continue;

    // 全部请求都在窗口内 → 原样保留（保持各适配器自身的累计口径）
    if (usageInRange.length === usageMessages.length) {
      results.push(s);
      continue;
    }

    // 部分请求在窗口外 → 裁剪 token 用量与消息计数
    const messageCount = s.messages.filter(
      (m) => m.kind === "message" && inRange(Date.parse(m.timestamp), since, until),
    ).length;
    results.push({
      ...s,
      tokenBreakdown: clipBreakdown(s.messages, since, until),
      messageCount,
    });
  }

  return results;
}
