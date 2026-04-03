/**
 * 时间规格解析工具
 *
 * 支持格式: "7d"(天), "1m"(月), "1y"(年)
 */

const SPEC_PATTERN = /^(\d+)([dmy])$/;

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

  const value = parseInt(match[1], 10);
  const unit = match[2];
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
