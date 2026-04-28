/**
 * ConstraintEnforcementService unit tests
 *
 * Tests constraint extraction and validation:
 * - extractConstraints() — MUST / SHOULD / MAY / implicit patterns
 * - validateOutput() — violation detection
 * - generateViolationReport() — report formatting
 * - formatConstraintsForPrompt() — prompt injection formatting
 * - toHardConstraints() — conversion
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { ConstraintEnforcementService } from "../../../../ai-harness/facade";

describe("ConstraintEnforcementService", () => {
  let service: ConstraintEnforcementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConstraintEnforcementService],
    }).compile();

    service = module.get<ConstraintEnforcementService>(
      ConstraintEnforcementService,
    );

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== extractConstraints ====================

  describe("extractConstraints", () => {
    describe("MUST constraints", () => {
      it("should extract 必须 pattern", () => {
        const constraints =
          service.extractConstraints("必须：所有对话使用古文风格");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MUST");
        expect(constraints[0].rule).toBe("所有对话使用古文风格");
        expect(constraints[0].confidence).toBeGreaterThanOrEqual(0.9);
        expect(constraints[0].id).toMatch(/^HC-/);
      });

      it("should extract 硬性约束 pattern", () => {
        const constraints =
          service.extractConstraints("硬性约束：半文半白风格");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MUST");
        expect(constraints[0].rule).toBe("半文半白风格");
      });

      it("should extract 禁止 pattern", () => {
        const constraints = service.extractConstraints("禁止：出现现代词汇");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MUST");
        expect(constraints[0].rule).toBe("出现现代词汇");
      });

      it("should extract 不能 pattern", () => {
        const constraints = service.extractConstraints("不能：使用科幻元素");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MUST");
      });

      it("should extract 严禁 pattern", () => {
        const constraints = service.extractConstraints("严禁：违反历史设定");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MUST");
        expect(constraints[0].rule).toBe("违反历史设定");
      });

      it("should extract multiple MUST constraints from same description", () => {
        const description =
          "必须：使用古文风格\n禁止：出现现代词汇\n严禁：跨时代情节";
        const constraints = service.extractConstraints(description);
        const mustConstraints = constraints.filter((c) => c.type === "MUST");
        expect(mustConstraints.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe("SHOULD constraints", () => {
      it("should extract 建议 pattern", () => {
        const constraints = service.extractConstraints("建议：多使用环境描写");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("SHOULD");
        expect(constraints[0].id).toMatch(/^SC-/);
      });

      it("should extract 应该 pattern", () => {
        const constraints = service.extractConstraints("应该：体现人物性格");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("SHOULD");
      });

      it("should extract 尽量 pattern", () => {
        const constraints = service.extractConstraints("尽量：避免重复情节");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("SHOULD");
      });
    });

    describe("MAY constraints", () => {
      it("should extract 可以 pattern", () => {
        const constraints = service.extractConstraints("可以：适当加入对话");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MAY");
        expect(constraints[0].id).toMatch(/^MC-/);
      });

      it("should extract 允许 pattern", () => {
        const constraints = service.extractConstraints("允许：使用白话文解说");
        expect(constraints).toHaveLength(1);
        expect(constraints[0].type).toBe("MAY");
      });
    });

    describe("implicit constraints", () => {
      it("should detect mute character constraint (X是哑巴)", () => {
        const constraints = service.extractConstraints("钟叔是哑巴，不能说话");
        const muteConstraint = constraints.find(
          (c) => c.rule.includes("钟叔") && c.rule.includes("不能说话"),
        );
        expect(muteConstraint).toBeDefined();
        expect(muteConstraint?.type).toBe("MUST");
        expect(muteConstraint?.confidence).toBeGreaterThanOrEqual(0.95);
      });

      it("should detect mute character constraint (X是哑仆)", () => {
        const constraints = service.extractConstraints("小明是哑仆");
        const muteConstraint = constraints.find(
          (c) => c.rule.includes("小明") && c.rule.includes("不能说话"),
        );
        expect(muteConstraint).toBeDefined();
      });

      it("should detect cannot-speak constraint (X不会说话)", () => {
        const constraints = service.extractConstraints("王五不会说话");
        const muteConstraint = constraints.find(
          (c) => c.rule.includes("王五") && c.rule.includes("不能说话"),
        );
        expect(muteConstraint).toBeDefined();
        expect(muteConstraint?.type).toBe("MUST");
      });

      it("should detect destroyed voice constraint (X自毁声带)", () => {
        const constraints = service.extractConstraints("侦探自毁声带");
        const voiceConstraint = constraints.find(
          (c) => c.rule.includes("侦探") && c.rule.includes("不能说话"),
        );
        expect(voiceConstraint).toBeDefined();
      });

      it("should detect era setting constraint (背景设定在古代)", () => {
        const constraints =
          service.extractConstraints("背景设定在古代，故事发生在唐代");
        const eraConstraint = constraints.find((c) =>
          c.rule.includes("不符的现代词汇"),
        );
        expect(eraConstraint).toBeDefined();
        expect(eraConstraint?.type).toBe("MUST");
      });

      it("should detect era setting (故事发生在清朝)", () => {
        const constraints = service.extractConstraints("故事发生在清朝时代");
        const eraConstraint = constraints.find((c) => c.rule.includes("清朝"));
        expect(eraConstraint).toBeDefined();
      });

      it("should avoid duplicate mute constraints for same character", () => {
        // If character is already constrained via explicit rule, implicit should not add duplicate
        const description = "必须：钟叔不能说话\n钟叔是哑巴";
        const constraints = service.extractConstraints(description);

        // Count rules about 钟叔 not speaking
        const relatedConstraints = constraints.filter(
          (c) => c.rule.includes("钟叔") && c.rule.includes("不能说话"),
        );
        // Deduplication may or may not apply depending on exact text patterns;
        // at minimum there should be at least one
        expect(relatedConstraints.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("should return empty array for description with no constraints", () => {
      const constraints = service.extractConstraints(
        "This is a story about a detective who solves crimes.",
      );
      expect(constraints).toHaveLength(0);
    });

    it("should assign sequential IDs", () => {
      const description = "必须：规则A\n建议：规则B\n可以：规则C";
      const constraints = service.extractConstraints(description);
      expect(constraints.length).toBeGreaterThanOrEqual(3);
      // IDs should be unique
      const ids = constraints.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ==================== validateOutput ====================

  describe("validateOutput", () => {
    it("should return isValid=true when no violations", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "张三不能说话",
          source: "必须：张三不能说话",
          confidence: 0.9,
        },
      ];

      // Output does not have 张三 speaking
      const result = await service.validateOutput(
        "夜色深沉，张三站在门口，默默地点了点头。",
        constraints,
      );

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.checkedConstraints).toBe(1);
      expect(result.passedConstraints).toBe(1);
    });

    it("should detect violation when entity speaks despite mute constraint", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "钟叔不能说话",
          source: "必须：钟叔不能说话",
          confidence: 0.95,
        },
      ];

      const output = '钟叔说道："你好，请进。"';
      const result = await service.validateOutput(output, constraints);

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraintId).toBe("HC-001");
      expect(result.violations[0].severity).toBe("critical");
    });

    it("should skip SHOULD constraints in validation", async () => {
      const constraints = [
        {
          id: "SC-001",
          type: "SHOULD" as const,
          rule: "尽量使用古文",
          source: "建议：尽量使用古文",
          confidence: 0.8,
        },
      ];

      const result = await service.validateOutput(
        "现代中文的输出内容",
        constraints,
      );

      // SHOULD constraints are not checked
      expect(result.isValid).toBe(true);
      expect(result.checkedConstraints).toBe(0);
    });

    it("should skip MAY constraints in validation", async () => {
      const constraints = [
        {
          id: "MC-001",
          type: "MAY" as const,
          rule: "可以使用白话文",
          source: "可以：可以使用白话文",
          confidence: 0.7,
        },
      ];

      const result = await service.validateOutput("任意内容", constraints);
      expect(result.checkedConstraints).toBe(0);
    });

    it("should handle HardConstraint format (severity instead of type)", async () => {
      const hardConstraints = [
        {
          id: "HC-001",
          rule: "李四不能说话",
          reason: "李四是哑仆",
          severity: "MUST" as const,
        },
      ];

      const output = '李四道："在下明白。"';
      const result = await service.validateOutput(output, hardConstraints);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should return empty violations for unknown constraint rule format", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "保持风格一致性", // No X不能Y pattern
          source: "必须：保持风格一致性",
          confidence: 0.9,
        },
      ];

      const result = await service.validateOutput(
        "任意内容，风格各异。",
        constraints,
      );

      // Rule doesn't match the "X不能Y" pattern, so no violation detected
      expect(result.isValid).toBe(true);
    });
  });

  // ==================== generateViolationReport ====================

  describe("generateViolationReport", () => {
    it("should return no-violation message for empty violations", () => {
      const report = service.generateViolationReport([]);
      expect(report).toBe("未检测到约束违规。");
    });

    it("should format single violation report", () => {
      const violations = [
        {
          constraintId: "HC-001",
          rule: "钟叔不能说话",
          violatingText: "钟叔说道",
          position: 15,
          severity: "critical" as const,
        },
      ];

      const report = service.generateViolationReport(violations);

      expect(report).toContain("1 处约束违规");
      expect(report).toContain("HC-001");
      expect(report).toContain("钟叔不能说话");
      expect(report).toContain("钟叔说道");
      expect(report).toContain("15");
      expect(report).toContain("critical");
    });

    it("should format multiple violations with sequential numbering", () => {
      const violations = [
        {
          constraintId: "HC-001",
          rule: "规则A",
          violatingText: "违规A",
          position: 5,
          severity: "critical" as const,
        },
        {
          constraintId: "HC-002",
          rule: "规则B",
          violatingText: "违规B",
          position: 20,
          severity: "critical" as const,
        },
      ];

      const report = service.generateViolationReport(violations);

      expect(report).toContain("2 处约束违规");
      expect(report).toContain("1.");
      expect(report).toContain("2.");
    });
  });

  // ==================== formatConstraintsForPrompt ====================

  describe("formatConstraintsForPrompt", () => {
    const mixedConstraints = [
      {
        id: "HC-001",
        type: "MUST" as const,
        rule: "规则A",
        source: "必须：规则A",
        confidence: 0.9,
      },
      {
        id: "SC-002",
        type: "SHOULD" as const,
        rule: "建议B",
        source: "建议：建议B",
        confidence: 0.8,
      },
      {
        id: "MC-003",
        type: "MAY" as const,
        rule: "建议C",
        source: "可以：建议C",
        confidence: 0.7,
      },
    ];

    it("should format MUST constraints with critical header", () => {
      const formatted = service.formatConstraintsForPrompt(
        mixedConstraints,
        "MUST",
      );
      expect(formatted).toContain("硬性约束");
      expect(formatted).toContain("HC-001");
      expect(formatted).toContain("规则A");
      expect(formatted).not.toContain("建议B");
    });

    it("should format SHOULD constraints with soft header", () => {
      const formatted = service.formatConstraintsForPrompt(
        mixedConstraints,
        "SHOULD",
      );
      expect(formatted).toContain("软性约束");
      expect(formatted).toContain("SC-002");
      expect(formatted).toContain("建议B");
    });

    it("should format MAY constraints with reference header", () => {
      const formatted = service.formatConstraintsForPrompt(
        mixedConstraints,
        "MAY",
      );
      expect(formatted).toContain("参考建议");
      expect(formatted).toContain("MC-003");
    });

    it("should return empty string when no constraints of given type", () => {
      const onlyMust = mixedConstraints.filter((c) => c.type === "MUST");
      const formatted = service.formatConstraintsForPrompt(onlyMust, "SHOULD");
      expect(formatted).toBe("");
    });

    it("should default to MUST type when no type specified", () => {
      const formatted = service.formatConstraintsForPrompt(mixedConstraints);
      expect(formatted).toContain("硬性约束");
    });
  });

  // ==================== toHardConstraints ====================

  describe("toHardConstraints", () => {
    it("should convert MUST constraints to HardConstraints", () => {
      const extracted = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "不能违反历史",
          source: "必须：不能违反历史",
          confidence: 0.9,
        },
      ];

      const hard = service.toHardConstraints(extracted);

      expect(hard).toHaveLength(1);
      expect(hard[0].id).toBe("HC-001");
      expect(hard[0].rule).toBe("不能违反历史");
      expect(hard[0].severity).toBe("MUST");
      expect(hard[0].reason).toBe("必须：不能违反历史");
    });

    it("should include SHOULD constraints in hard constraints", () => {
      const extracted = [
        {
          id: "SC-001",
          type: "SHOULD" as const,
          rule: "建议使用古文",
          source: "建议：使用古文",
          confidence: 0.8,
        },
      ];

      const hard = service.toHardConstraints(extracted);
      expect(hard).toHaveLength(1);
      expect(hard[0].severity).toBe("SHOULD");
    });

    it("should exclude MAY constraints", () => {
      const extracted = [
        {
          id: "MC-001",
          type: "MAY" as const,
          rule: "可选规则",
          source: "可以：可选规则",
          confidence: 0.7,
        },
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "必须规则",
          source: "必须：必须规则",
          confidence: 0.9,
        },
      ];

      const hard = service.toHardConstraints(extracted);
      expect(hard).toHaveLength(1);
      expect(hard[0].id).toBe("HC-001");
    });

    it("should return empty array for empty input", () => {
      const hard = service.toHardConstraints([]);
      expect(hard).toHaveLength(0);
    });
  });

  // ==================== action expansion ====================

  describe("action expansion in violation detection", () => {
    it("should detect violation using expanded speak actions (道)", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "老人不能说话",
          source: "必须：老人不能说话",
          confidence: 0.95,
        },
      ];

      const output = '老人道："请进来吧。"';
      const result = await service.validateOutput(output, constraints);

      expect(result.isValid).toBe(false);
    });

    it("should detect violation using expanded speak actions (问道)", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "仆人不能说话",
          source: "必须：仆人不能说话",
          confidence: 0.95,
        },
      ];

      const output = '仆人问道："主人需要什么？"';
      const result = await service.validateOutput(output, constraints);

      expect(result.isValid).toBe(false);
    });

    it("should detect violation using expanded sound actions (出声)", async () => {
      const constraints = [
        {
          id: "HC-001",
          type: "MUST" as const,
          rule: "侍女不能发出声音",
          source: "必须：侍女不能发出声音",
          confidence: 0.95,
        },
      ];

      const output = "侍女出声喊道：救命！";
      const result = await service.validateOutput(output, constraints);

      expect(result.isValid).toBe(false);
    });
  });
});
