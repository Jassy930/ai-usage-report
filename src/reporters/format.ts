/** 通用数值格式化工具 */

/** 千分位格式化 */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** 人类可读单位格式化 (1.2B, 350.5M, 12.3K) */
export function fmtHuman(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Token 数值 + 人类可读 (e.g. "1,500,000 (1.5M)") */
export function fmtTokens(n: number): string {
  if (n >= 1_000) return `${fmt(n)} (${fmtHuman(n)})`;
  return fmt(n);
}
