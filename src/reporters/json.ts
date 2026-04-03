/**
 * JSON 报告输出
 */

import type { UsageReport } from "../core/report";

/**
 * 将 UsageReport 序列化为格式化的 JSON 字符串
 * 使用 2-space 缩进，输出稳定结构
 */
export function renderJsonReport(report: UsageReport): string {
  return JSON.stringify(report, null, 2);
}
