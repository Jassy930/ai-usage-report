/**
 * context 报告构建器
 */

import { basename } from "node:path";
import type { ContextProject, ContextReport, ContextSession } from "./context";
import { createEmptyContextReport } from "./context";
import type { SessionRecord } from "./types";

function toContextSession(session: SessionRecord): ContextSession {
  return {
    tool: session.tool,
    sessionId: session.sessionId,
    timestampStart: session.timestamp,
    timestampEnd: session.timestampEnd,
    projectPath: session.projectPath,
    model: session.model,
    summary: session.summary,
    goal: session.goal,
    outcome: session.outcome,
    messageCount: session.messageCount,
    tokenBreakdown: session.tokenBreakdown,
    messages: session.messages ?? [],
    rawRefs: session.rawRefs ?? [],
  };
}

function compareSessionsAscending(a: ContextSession, b: ContextSession): number {
  return a.timestampStart.localeCompare(b.timestampStart);
}

export function buildContextReport(
  sessions: SessionRecord[],
  meta: ContextReport["meta"],
  userBrief: string | null = null,
): ContextReport {
  const report = createEmptyContextReport(meta, userBrief);
  const projectMap = new Map<string, ContextProject>();

  for (const session of sessions) {
    const contextSession = toContextSession(session);
    const projectPath = session.projectPath;

    if (!projectPath) {
      report.ungroupedSessions.push(contextSession);
      continue;
    }

    let project = projectMap.get(projectPath);
    if (!project) {
      project = {
        projectKey: projectPath,
        projectLabel: basename(projectPath) || projectPath,
        sessions: [],
      };
      projectMap.set(projectPath, project);
    }

    project.sessions.push(contextSession);
  }

  report.projects = Array.from(projectMap.values())
    .map((project) => ({
      ...project,
      sessions: project.sessions.sort(compareSessionsAscending),
    }))
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));

  report.ungroupedSessions.sort(compareSessionsAscending);

  return report;
}
