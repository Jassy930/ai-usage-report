import { expect, test } from "bun:test";

test("library entry exports collectAllSessions", async () => {
  const mod = await import("../src/index");
  expect(typeof mod.collectAllSessions).toBe("function");
});
