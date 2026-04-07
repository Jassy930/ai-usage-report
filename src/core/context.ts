/**
 * context 导出数据模型
 */

import type {
  RawRef,
  SessionMessage as ContextMessage,
  SessionUsage as ContextUsage,
  SessionToolCall as ContextToolCall,
  TokenBreakdown,
  ToolType,
} from "./types";

export interface ContextSession {
  tool: ToolType;
  sessionId: string;
  timestampStart: string;
  timestampEnd?: string;
  projectPath?: string;
  model?: string;
  summary?: string;
  goal?: string;
  outcome?: string;
  messageCount: number;
  tokenBreakdown: TokenBreakdown;
  messages: ContextMessage[];
  rawRefs: RawRef[];
}

export interface ContextProject {
  projectKey: string;
  projectLabel: string;
  sessions: ContextSession[];
}

export interface ContextReport {
  meta: {
    generatedAt: string;
    since: string;
    until: string;
    sources: ToolType[];
    defaultTimezone: string;
  };
  userBrief: string | null;
  projects: ContextProject[];
  ungroupedSessions: ContextSession[];
}

export function createEmptyContextReport(
  meta: ContextReport["meta"],
  userBrief: string | null = null,
): ContextReport {
  return {
    meta,
    userBrief,
    projects: [],
    ungroupedSessions: [],
  };
}
