/**
 * SKILL.md byte-equal spec（v5.1 R2-A0）
 *
 * 守门约束：8 个 SKILL.md 抽出的 soul / duty 段必须与现有 18 个 soul.md /
 * duties/*.md 完全 byte-equal（包括前后 \n 处理）。
 *
 * R2-A 双轨期：duty-loader 仍读 18 个原始文件，SKILL.md loader 读新文件，
 * 两条路径必须给同样的 prompt body。本 spec 是这一约束的硬证明。
 *
 * R2-C 删旧实现时：18 原始文件被删，本 spec 也跟着删（届时 SKILL.md 是
 * 唯一来源）。
 */
import * as fs from "fs";
import * as path from "path";
import { clearSkillCache, loadSkill } from "../skill-md-loader";

const AGENTS_DIR = path.resolve(__dirname, "..", "..", "agents");

interface AgentSkillMapping {
  /** agents/<agentDir>/ 下的子目录名（kebab-case）*/
  readonly agentDir: string;
  /** 该 agent 是否有 soul.md（researcher / reconciler / analyst / reviewer 等都有）*/
  readonly hasSoul: boolean;
  /** 该 agent 在 duties/*.md 中的 duty 文件名（不含 .md），按 SKILL.md frontmatter 顺序*/
  readonly duties: ReadonlyArray<string>;
}

const MAPPING: ReadonlyArray<AgentSkillMapping> = [
  {
    agentDir: "leader",
    hasSoul: true,
    duties: ["plan", "assess-research", "foreword", "signoff"],
  },
  { agentDir: "researcher", hasSoul: true, duties: [] },
  { agentDir: "reconciler", hasSoul: true, duties: [] },
  { agentDir: "analyst", hasSoul: true, duties: [] },
  { agentDir: "reviewer", hasSoul: true, duties: [] },
  {
    agentDir: "verifier",
    hasSoul: true,
    duties: ["citation-audit"],
  },
  {
    agentDir: "steward",
    hasSoul: true,
    duties: ["budget-guard"],
  },
  {
    agentDir: "writer",
    hasSoul: true,
    duties: ["chapter", "dimension-outline", "mission-outline", "single-shot"],
  },
];

/**
 * 比较两段文本是否"渲染等价"（render-equivalent）—— 容忍 prettier 自动格式化
 * 引入的纯格式化差异，但保留所有语义内容：
 *
 *   1. 行末 \r\n vs \n（git autocrlf 在 Windows 经常变换）
 *   2. 文件首/末多余 newline（prettier 在 <!-- start --> 后 / <!-- end --> 前
 *      自动插入空行）
 *   3. 段落与列表 / 标题之间额外空行（prettier 在 list 前 / heading 前补空行）
 *      → 多个连续 \n 折叠为单一段落分隔（\n\n）
 *   4. markdown 表格列宽对齐填充（prettier 把 `| a | bbb |` 自动 pad 到等宽 +
 *      separator dash 数量也跟着补齐）—— 行内连续 ≥2 空格 → 1 空格；连续
 *      ≥3 dash → `---`（markdown 渲染等价）
 *   5. 行尾空格 / 行尾 \r
 *
 * 这些差异都不会改变 markdown 渲染结果或 LLM prompt 语义；保留行内字符 / 标点
 * / 缩进 / 单空格分隔的差异（实质语义改动）必须仍然 fail。
 */
function normalizeForCompare(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const m = line.match(/^([ \t]*)(.*)$/);
      const indent = m![1];
      const body = m![2]
        .replace(/-{3,}/g, "---")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+$/, "");
      return indent + body;
    })
    // 跳过纯空行 —— prettier 在 list / heading 前后自动插入空行属于纯排版调整
    .filter((line) => line.trim().length > 0);
  return lines.join("\n");
}

beforeEach(() => clearSkillCache());

describe("SKILL.md byte-equal vs soul/duty.md (v5.1 R2-A0)", () => {
  it("注册了 8 个 agent SKILL.md", () => {
    expect(MAPPING).toHaveLength(8);
    for (const m of MAPPING) {
      const filePath = path.join(AGENTS_DIR, m.agentDir, "SKILL.md");
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  for (const m of MAPPING) {
    describe(`${m.agentDir}/SKILL.md`, () => {
      it("frontmatter.id == agent-playground.<agentDir>", () => {
        const skill = loadSkill(m.agentDir);
        expect(skill.frontmatter.id).toBe(`agent-playground.${m.agentDir}`);
      });

      if (m.hasSoul) {
        it("soul section byte-equal vs soul.md", () => {
          const skill = loadSkill(m.agentDir);
          const soulPath = path.join(AGENTS_DIR, m.agentDir, "soul.md");
          const expected = fs.readFileSync(soulPath, "utf8");
          expect(skill.soul).not.toBeNull();
          expect(normalizeForCompare(skill.soul!)).toBe(
            normalizeForCompare(expected),
          );
        });
      }

      it(`duties frontmatter == [${m.duties.join(",")}]`, () => {
        const skill = loadSkill(m.agentDir);
        expect([...skill.frontmatter.duties]).toEqual([...m.duties]);
      });

      for (const dutyName of m.duties) {
        it(`duty "${dutyName}" byte-equal vs duties/${dutyName}.md`, () => {
          const skill = loadSkill(m.agentDir);
          const dutyPath = path.join(
            AGENTS_DIR,
            m.agentDir,
            "duties",
            `${dutyName}.md`,
          );
          const expected = fs.readFileSync(dutyPath, "utf8");
          const actual = skill.duties[dutyName];
          expect(actual).toBeDefined();
          expect(normalizeForCompare(actual)).toBe(
            normalizeForCompare(expected),
          );
        });
      }
    });
  }

  it("frontmatter.allowedModels 全部声明（避免 R2-A 装配时 fallback）", () => {
    for (const m of MAPPING) {
      const skill = loadSkill(m.agentDir);
      expect(skill.frontmatter.allowedModels.length).toBeGreaterThan(0);
    }
  });
});
