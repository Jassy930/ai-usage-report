import { expect, test } from "bun:test";

test("context module exports report shape helpers", async () => {
  const mod = await import("../../src/core/context");
  expect(mod.createEmptyContextReport).toBeDefined();
});

test("context report types can represent projects and sessions", async () => {
  const mod = await import("../../src/core/context");
  type ContextReport = import("../../src/core/context").ContextReport;
  const report: ContextReport = {
    meta: {
      generatedAt: "2026-04-07T12:00:00+08:00",
      since: "2026-03-31T12:00:00+08:00",
      until: "2026-04-07T12:00:00+08:00",
      sources: ["codex", "claude-code"],
      defaultTimezone: "Asia/Shanghai",
    },
    userBrief: null,
    projects: [
      {
        projectKey: "/Users/demo/myapp",
        projectLabel: "myapp",
        sessions: [],
      },
    ],
    ungroupedSessions: [],
  };

  expect(report.projects).toHaveLength(1);
  expect(report.projects[0]?.projectLabel).toBe("myapp");
  expect(mod.createEmptyContextReport).toBeDefined();
});
