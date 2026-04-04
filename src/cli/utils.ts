/** 共享 CLI 工具函数 */

import type { ToolType } from "../core/types";

/** 将 tool 参数字符串转为 ToolType[] 或 undefined (all) */
export function resolveTools(tool: string): ToolType[] | undefined {
  if (tool === "codex") return ["codex"];
  if (tool === "claude-code") return ["claude-code"];
  return undefined;
}
