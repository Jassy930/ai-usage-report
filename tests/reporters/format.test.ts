import { describe, test, expect } from "bun:test";
import { fmt, fmtHuman, fmtTokens, escapeMarkdownCell } from "../../src/reporters/format";

describe("fmt", () => {
  test("零值", () => {
    expect(fmt(0)).toBe("0");
  });

  test("小数值不加千分位", () => {
    expect(fmt(999)).toBe("999");
  });

  test("千以上加千分位", () => {
    expect(fmt(1000)).toBe("1,000");
  });

  test("百万级", () => {
    expect(fmt(1_000_000)).toBe("1,000,000");
  });
});

describe("fmtHuman", () => {
  test("零值", () => {
    expect(fmtHuman(0)).toBe("0");
  });

  test("小数值原样返回", () => {
    expect(fmtHuman(999)).toBe("999");
  });

  test("千级别", () => {
    expect(fmtHuman(1000)).toBe("1.0K");
    expect(fmtHuman(1500)).toBe("1.5K");
  });

  test("百万级别", () => {
    expect(fmtHuman(1_500_000)).toBe("1.5M");
  });

  test("十亿级别", () => {
    expect(fmtHuman(2_000_000_000)).toBe("2.0B");
  });
});

describe("fmtTokens", () => {
  test("小数值不加括号", () => {
    expect(fmtTokens(500)).toBe("500");
  });

  test("千以上加括号和人类可读", () => {
    const result = fmtTokens(1500);
    expect(result).toContain("1,500");
    expect(result).toContain("1.5K");
  });
});

describe("escapeMarkdownCell", () => {
  test("转义管道符", () => {
    expect(escapeMarkdownCell("a|b")).toBe("a\\|b");
  });

  test("转义方括号", () => {
    expect(escapeMarkdownCell("[link]")).toBe("\\[link\\]");
  });

  test("转义 HTML 尖括号", () => {
    expect(escapeMarkdownCell("<script>")).toBe("&lt;script&gt;");
  });

  test("换行替换为空格", () => {
    expect(escapeMarkdownCell("a\nb")).toBe("a b");
  });

  test("混合特殊字符", () => {
    const result = escapeMarkdownCell("a|b<c>[d]\ne");
    expect(result).toBe("a\\|b&lt;c&gt;\\[d\\] e");
  });

  test("无特殊字符原样返回", () => {
    expect(escapeMarkdownCell("hello world")).toBe("hello world");
  });
});
