import { segmentRunOnParagraphs } from "../paragraph-segmenter.util";

describe("segmentRunOnParagraphs", () => {
  // 一段无空行、多句、>240 字的 run-on 散文
  const sentence =
    "这是一段用于测试的中文句子，描述了某个技术细节与其影响[1]。";
  const runon = sentence.repeat(8); // ~8 句、远超 240 字、0 空行

  it("把 run-on 长散文切成多个自然段", () => {
    const out = segmentRunOnParagraphs(runon);
    expect(out).not.toBe(runon);
    expect(out.split(/\n\s*\n/).length).toBeGreaterThan(1);
    // 不丢内容：去掉空白后字符一致
    expect(out.replace(/\s/g, "")).toBe(runon.replace(/\s/g, ""));
  });

  it("触发 onSegment 回调", () => {
    let n = 0;
    segmentRunOnParagraphs(runon, () => n++);
    expect(n).toBeGreaterThan(0);
  });

  it("短段不切分", () => {
    const short = "一句话。两句话。";
    expect(segmentRunOnParagraphs(short)).toBe(short);
  });

  it("已正常分段的内容保持不变", () => {
    const ok = `${sentence.repeat(2)}\n\n${sentence.repeat(2)}`;
    // 每段 <240 字，不应再切
    expect(segmentRunOnParagraphs(ok)).toBe(ok);
  });

  it("代码块内容不切分", () => {
    const code = "```\n" + runon + "\n```";
    expect(segmentRunOnParagraphs(code)).toBe(code);
  });

  it("列表不切分", () => {
    const list = `- ${sentence}\n- ${sentence}\n- ${sentence}`;
    expect(segmentRunOnParagraphs(list)).toBe(list);
  });

  it("表格不切分", () => {
    const table = `| 列A | 列B |\n| --- | --- |\n| ${sentence} | ${sentence} |`;
    expect(segmentRunOnParagraphs(table)).toBe(table);
  });

  it("标题行保留、其后 run-on 段被切", () => {
    const doc = `## 标题\n\n${runon}`;
    const out = segmentRunOnParagraphs(doc);
    expect(out.startsWith("## 标题")).toBe(true);
    expect(out.split(/\n\s*\n/).length).toBeGreaterThan(2);
  });

  it("图占位段不切分", () => {
    const fig = "![chart](#fig-1)";
    expect(segmentRunOnParagraphs(fig)).toBe(fig);
  });
});
