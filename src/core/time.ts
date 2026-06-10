/**
 * 时间规格解析工具
 *
 * 支持格式: "7d"(天), "1m"(月), "1y"(年)
 */

const SPEC_PATTERN = /^(\d+)([dmy])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 将时间规格字符串解析为起始日期
 *
 * @param spec - 时间规格，如 "7d", "1m", "1y"
 * @param now  - 参考时间点，默认为当前时间
 * @returns 计算后的起始日期（时间归零到本地时区当天 00:00:00）
 */
export function parseSinceSpec(spec: string, now?: Date): Date {
  const match = spec.match(SPEC_PATTERN);
  if (!match) {
    throw new Error(`无效的时间规格: "${spec}"，支持格式: Nd, Nm, Ny`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const ref = now ?? new Date();

  const result = new Date(ref);

  switch (unit) {
    case "d":
      result.setDate(result.getDate() - value);
      break;
    case "m":
      result.setMonth(result.getMonth() - value);
      break;
    case "y":
      result.setFullYear(result.getFullYear() - value);
      break;
  }

  // 归零到本地时区当天 00:00:00（与官方端的日统计口径一致）
  result.setHours(0, 0, 0, 0);

  return result;
}

/** 解析 YYYY-MM-DD 为年月日分量并校验 */
function parseDateParts(input: string): [number, number, number] {
  if (!DATE_PATTERN.test(input)) {
    throw new Error(`无效的日期格式: "${input}"，支持格式: YYYY-MM-DD`);
  }
  const [y, m, d] = input.split("-").map((p) => parseInt(p, 10)) as [number, number, number];
  // 用 Date 回读校验真实日期（如 2026-02-30 会翻转到 3 月）
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new Error(`无效的日期值: "${input}"`);
  }
  return [y, m, d];
}

/**
 * 将 YYYY-MM-DD 字符串解析为本地时区当天开始时间
 */
export function parseDateInput(input: string): Date {
  const [y, m, d] = parseDateParts(input);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * 将 YYYY-MM-DD 字符串解析为本地时区当天结束时间（23:59:59.999）
 */
export function parseDateEndInput(input: string): Date {
  const [y, m, d] = parseDateParts(input);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export interface TimeWindowOptions {
  since?: string;
  until?: string;
}

/**
 * 解析时间窗口。默认返回最近 7 天到 now 的范围。
 */
export function resolveTimeWindow(
  options: TimeWindowOptions,
  now: Date = new Date(),
): { since: Date; until: Date } {
  const until = options.until
    ? parseDateEndInput(options.until)
    : new Date(now);

  const since = options.since
    ? (DATE_PATTERN.test(options.since)
      ? parseDateInput(options.since)
      : parseSinceSpec(options.since, now))
    : parseSinceSpec("7d", now);

  return { since, until };
}
