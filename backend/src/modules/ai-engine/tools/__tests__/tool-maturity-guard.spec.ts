/**
 * 工具成熟度治理守护 (2026-06-14)
 *
 * 红线:maturity='stub' 的工具(未实现/返回假数据/模拟成功)必须 enabled=false,
 * 不得进入 agent catalog —— 否则 LLM 召回后会拿到假"成功"污染下游决策。
 *
 * 本守护用静态源码扫描实现(不依赖 DI 实例化),覆盖 ESLint 盖不到的语义约束。
 * 若新增/改动工具违反该约束,本 spec 失败 → CI 拦截。
 */

import * as fs from "fs";
import * as path from "path";

const CATEGORIES_DIR = path.resolve(__dirname, "../categories");

function walkToolFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...walkToolFiles(full));
    } else if (entry.name.endsWith(".tool.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("tool maturity governance guard", () => {
  const files = walkToolFiles(CATEGORIES_DIR);

  it("能扫描到工具文件", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("maturity='stub' 的工具必须 enabled=false(catalog 不得暴露未实现/假数据工具)", () => {
    const violations: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const isStub = /maturity\s*[:=]\s*["']stub["']/.test(src);
      if (!isStub) continue;
      const isDisabled = /enabled\s*[:=]\s*false/.test(src);
      if (!isDisabled) {
        violations.push(path.relative(CATEGORIES_DIR, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
