/**
 * 维度评分接地 + overall 服务端重算（review-fix #3，2026-05-23）。
 * 提取为纯函数：便于单测、可复用，并避免把逻辑埋进 per-dim 流水线（拆 god-class spec）。
 *
 * (a) sources_sufficiency（来源数量轴）按真实 uniqueSources 平滑封顶：
 *     1 来源→20 / 4→80 / 5→100。单来源维度拿不到高分，杜绝靠 prose 自评 80；
 *     平滑梯度而非旧的"≥5 URL 才及格"硬悬崖，正常多源维度基本不受影响。
 * (b) overall 不取 LLM verbatim，改由各轴均值重算 → 与展示的各轴一致
 *     （消除"轴都低但 overall=80"），grade 枚举随 overall 一致派生。
 *
 * 原地修改传入对象（caller 已持有引用）。
 */
export function groundDimensionGrade(
  grade: { overall: number; grade: string; axes: unknown },
  uniqueSources: number,
): void {
  const axesRec = grade.axes as Record<
    string,
    { score: number; comment: string }
  >;
  const supplyCeil = Math.min(100, uniqueSources * 20);
  if (axesRec["sources_sufficiency"]) {
    axesRec["sources_sufficiency"].score = Math.min(
      axesRec["sources_sufficiency"].score,
      supplyCeil,
    );
  }
  const axisVals = Object.values(axesRec).map((a) => a.score);
  if (axisVals.length > 0) {
    grade.overall = Math.round(
      axisVals.reduce((a, b) => a + b, 0) / axisVals.length,
    );
    grade.grade =
      grade.overall >= 80
        ? "excellent"
        : grade.overall >= 65
          ? "good"
          : grade.overall >= 50
            ? "fair"
            : "poor";
  }
}
