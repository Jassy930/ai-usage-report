import { expect, test, describe } from "bun:test";
import { parseSinceSpec } from "../../src/core/time";

const now = new Date("2026-04-03T12:00:00Z");

describe("parseSinceSpec", () => {
  test("parses day range '7d'", () => {
    const since = parseSinceSpec("7d", now);
    expect(since.toISOString()).toBe("2026-03-27T00:00:00.000Z");
  });

  test("parses day range '30d'", () => {
    const since = parseSinceSpec("30d", now);
    expect(since.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  test("parses month range '1m'", () => {
    const since = parseSinceSpec("1m", now);
    expect(since.toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });

  test("parses month range '3m'", () => {
    const since = parseSinceSpec("3m", now);
    expect(since.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  test("parses year range '1y'", () => {
    const since = parseSinceSpec("1y", now);
    expect(since.toISOString()).toBe("2025-04-03T00:00:00.000Z");
  });

  test("defaults to current time when now is omitted", () => {
    const since = parseSinceSpec("1d");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    expect(since.getTime()).toBe(yesterday.getTime());
  });

  test("throws on invalid spec", () => {
    expect(() => parseSinceSpec("abc")).toThrow();
    expect(() => parseSinceSpec("")).toThrow();
    expect(() => parseSinceSpec("7x")).toThrow();
  });
});
