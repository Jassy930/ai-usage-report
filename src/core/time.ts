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
 * @returns 计算后的起始日期（时间归零到当天 00:00:00 UTC）
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
      result.setUTCDate(result.getUTCDate() - value);
      break;
    case "m":
      result.setUTCMonth(result.getUTCMonth() - value);
      break;
    case "y":
      result.setUTCFullYear(result.getUTCFullYear() - value);
      break;
  }

  // 归零到当天 00:00:00 UTC
  result.setUTCHours(0, 0, 0, 0);

  return result;
}

/**
 * 将 YYYY-MM-DD 字符串解析为 UTC 当天开始时间
 */
export function parseDateInput(input: string): Date {
  if (!DATE_PATTERN.test(input)) {
    throw new Error(`无效的日期格式: "${input}"，支持格式: YYYY-MM-DD`);
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的日期值: "${input}"`);
  }

  return date;
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
    ? new Date(`${options.until}T23:59:59.999Z`)
    : new Date(now);

  const since = options.since
    ? (DATE_PATTERN.test(options.since)
      ? parseDateInput(options.since)
      : parseSinceSpec(options.since, now))
    : parseSinceSpec("7d", now);

  if (Number.isNaN(until.getTime())) {
    throw new Error(`无效的日期格式: "${options.until}"，支持格式: YYYY-MM-DD`);
  }

  return { since, until };
}
