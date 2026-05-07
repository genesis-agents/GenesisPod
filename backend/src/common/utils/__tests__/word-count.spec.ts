import { countCJKWords } from "../word-count";

describe("countCJKWords (PR-2' v1.6 D2 派生真值 RV-3)", () => {
  // RV-3a: CJK 字符
  it("RV-3a: countCJKWords('你好世界') === 4", () => {
    expect(countCJKWords("你好世界")).toBe(4);
  });

  // RV-3b: 拉丁字符级 + 空白不计
  it("RV-3b: countCJKWords('hi world') === 7", () => {
    expect(countCJKWords("hi world")).toBe(7); // h-i-w-o-r-l-d
  });

  // RV-3c: 中英混合 + 空白 + 换行
  it("RV-3c: countCJKWords('你好 world\\n') === 7", () => {
    expect(countCJKWords("你好 world\n")).toBe(7); // 2 CJK + 5 拉丁
  });

  // RV-3d: 零宽空格 strip
  it("RV-3d: countCJKWords('hi\\u200Bworld') === 7（零宽空格被 strip）", () => {
    expect(countCJKWords("hi​world")).toBe(7);
  });

  // RV-3e: emoji 占 1 unicode code-point（不被代理对拆 2）
  it("RV-3e: countCJKWords('👋你好') === 3", () => {
    expect(countCJKWords("👋你好")).toBe(3);
  });

  it("空字符串", () => {
    expect(countCJKWords("")).toBe(0);
  });

  it("仅空白", () => {
    expect(countCJKWords("   \n\t  ")).toBe(0);
  });

  it("BOM (U+FEFF) 被 strip", () => {
    expect(countCJKWords("﻿你好")).toBe(2);
  });

  it("零宽连接符 (U+200D) 被 strip", () => {
    expect(countCJKWords("a‍b")).toBe(2);
  });

  it("LRM/RLM (U+200E/U+200F) 被 strip", () => {
    expect(countCJKWords("a‎b‏c")).toBe(3);
  });

  it("RV-3 padding 攻击：100 个零宽空格 + 5 字 → 5（不被假字数 padding 通过硬合约）", () => {
    const padded = "你好世界你" + "​".repeat(100);
    expect(countCJKWords(padded)).toBe(5);
  });
});
