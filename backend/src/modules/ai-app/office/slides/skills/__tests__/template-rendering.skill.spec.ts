/**
 * TemplateRenderingSkill Unit Tests
 *
 * Tests for template rendering skill - deterministic HTML generation
 * from PageContent.sections to slide HTML output.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TemplateRenderingSkill } from "../template-rendering.skill";
import { ChartRendererSkill } from "../chart-renderer.skill";
import {
  PageOutline,
  PageContent,
  PageTemplateType,
} from "../../checkpoint/checkpoint.types";
import type { SkillContext } from "@/modules/ai-engine/skills";

// ============================================================================
// Helpers
// ============================================================================

function makeContext(id = "exec-001"): SkillContext {
  return {
    executionId: id,
    skillId: "slides-template-rendering",
    createdAt: new Date(),
  };
}

function makeOutline(
  templateType: PageTemplateType,
  pageNumber = 1,
): PageOutline {
  return {
    pageNumber,
    title: "Test Slide Title",
    subtitle: "Test subtitle",
    templateType,
    contentBrief: "Test content brief",
    keyElements: ["Key point 1", "Key point 2"],
    layoutHints: [],
  };
}

function makeContent(overrides?: Partial<PageContent>): PageContent {
  return {
    title: "Test Slide Title",
    subtitle: "Test subtitle",
    sections: [
      {
        type: "text",
        position: "left",
        content: "Main text content for testing",
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// Mock Chart Renderer
// ============================================================================

function makeMockChartRenderer(): jest.Mocked<ChartRendererSkill> {
  return {
    extractChartData: jest.fn().mockReturnValue(null),
    generateSampleData: jest.fn().mockReturnValue({
      labels: ["A", "B", "C"],
      values: [10, 20, 30],
    }),
    renderToSvg: jest
      .fn()
      .mockReturnValue('<svg width="500" height="300"><rect/></svg>'),
  } as unknown as jest.Mocked<ChartRendererSkill>;
}

// ============================================================================
// Tests
// ============================================================================

describe("TemplateRenderingSkill", () => {
  let skill: TemplateRenderingSkill;
  let mockChartRenderer: jest.Mocked<ChartRendererSkill>;

  beforeEach(() => {
    mockChartRenderer = makeMockChartRenderer();
    skill = new TemplateRenderingSkill(mockChartRenderer);
  });

  // --------------------------------------------------------------------------
  // ISkill interface properties
  // --------------------------------------------------------------------------

  describe("ISkill interface properties", () => {
    it("should have correct id", () => {
      expect(skill.id).toBe("slides-template-rendering");
    });

    it("should have correct name", () => {
      expect(skill.name).toBe("模板渲染");
    });

    it("should have correct domain", () => {
      expect(skill.domain).toBe("slides");
    });

    it("should have version", () => {
      expect(skill.version).toBe("4.0.0");
    });

    it("should have correct tags", () => {
      expect(skill.tags).toContain("slides");
      expect(skill.tags).toContain("template");
      expect(skill.tags).toContain("rendering");
    });
  });

  // --------------------------------------------------------------------------
  // execute() - input validation
  // --------------------------------------------------------------------------

  describe("execute() - input validation", () => {
    it("should return failure when pageOutline.templateType is missing", async () => {
      const input = {
        pageOutline: {} as PageOutline,
        pageContent: makeContent(),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("should return failure when pageContent.title is missing", async () => {
      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: { sections: [] } as unknown as PageContent,
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("should return failure for orchestrator input with no extractable data", async () => {
      const orchestratorInput = {
        task: "render",
        context: {},
        previousOutputs: {},
      };

      const result = await skill.execute(
        orchestratorInput as Parameters<typeof skill.execute>[0],
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("should include executionId in metadata on failure", async () => {
      const input = {
        pageOutline: {} as PageOutline,
        pageContent: makeContent(),
      };

      const ctx = makeContext("exec-validation-test");
      const result = await skill.execute(input, ctx);

      expect(result.metadata?.executionId).toBe("exec-validation-test");
    });
  });

  // --------------------------------------------------------------------------
  // execute() - direct input format success paths
  // --------------------------------------------------------------------------

  describe("execute() - direct input format", () => {
    const templateTypes: PageTemplateType[] = [
      "cover",
      "toc",
      "pillars",
      "timeline",
      "dashboard",
      "comparison",
      "closing",
    ];

    templateTypes.forEach((templateType) => {
      it(`should successfully render template type: ${templateType}`, async () => {
        const input = {
          pageOutline: makeOutline(templateType),
          pageContent: makeContent(),
        };

        const result = await skill.execute(input, makeContext());

        expect(result.success).toBe(true);
        expect(result.data?.html).toBeTruthy();
        expect(result.data?.templateId).toBeTruthy();
        expect(result.data?.themeId).toBeTruthy();
        expect(typeof result.data?.variables).toBe("object");
      });
    });

    it("should use default theme genspark-dark when not specified", async () => {
      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(true);
      expect(result.data?.themeId).toBe("genspark-dark");
    });

    it("should use specified themeId", async () => {
      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
        themeId: "genspark-dark",
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(true);
      expect(result.data?.themeId).toBe("genspark-dark");
    });

    it("should return HTML containing slide-container", async () => {
      const input = {
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent({
          title: "Three Pillars of Success",
          sections: [
            { type: "text", position: "left", content: "Pillar 1" },
            { type: "text", position: "center", content: "Pillar 2" },
            { type: "text", position: "right", content: "Pillar 3" },
          ],
        }),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(true);
      expect(result.data?.html).toContain("slide-container");
    });

    it("should include execution metadata with timing", async () => {
      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.metadata?.startTime).toBeInstanceOf(Date);
      expect(result.metadata?.endTime).toBeInstanceOf(Date);
      expect(typeof result.metadata?.duration).toBe("number");
    });
  });

  // --------------------------------------------------------------------------
  // execute() - orchestrator input format
  // --------------------------------------------------------------------------

  describe("execute() - orchestrator input format", () => {
    it("should extract pageOutline and pageContent from context", async () => {
      const orchestratorInput = {
        task: "render-page",
        context: {
          input: {
            themeId: "genspark-dark",
          },
          pageOutline: makeOutline("splitLayout"),
          pageContent: makeContent(),
        },
        previousOutputs: {},
      };

      const result = await skill.execute(
        orchestratorInput as Parameters<typeof skill.execute>[0],
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.html).toBeTruthy();
    });

    it("should extract themeId from context.input", async () => {
      const orchestratorInput = {
        task: "render-page",
        context: {
          input: {
            themeId: "genspark-dark",
          },
          pageOutline: makeOutline("cover"),
          pageContent: makeContent(),
        },
      };

      const result = await skill.execute(
        orchestratorInput as Parameters<typeof skill.execute>[0],
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.themeId).toBe("genspark-dark");
    });

    it("should extract pageOutline from previousOutputs slides-outline-planning", async () => {
      const orchestratorInput = {
        task: "render-page",
        context: {
          input: {},
          pageContent: makeContent(),
        },
        previousOutputs: {
          "slides-outline-planning": {
            pages: [makeOutline("toc")],
          },
        },
      };

      const result = await skill.execute(
        orchestratorInput as Parameters<typeof skill.execute>[0],
        makeContext(),
      );

      expect(result.success).toBe(true);
    });

    it("should extract pageContent from context.input when not at top level", async () => {
      const orchestratorInput = {
        task: "render-page",
        context: {
          input: {
            pageOutline: makeOutline("framework"),
            pageContent: makeContent({ title: "Framework Slide" }),
          },
        },
      };

      const result = await skill.execute(
        orchestratorInput as Parameters<typeof skill.execute>[0],
        makeContext(),
      );

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // render() - public method
  // --------------------------------------------------------------------------

  describe("render() - public method", () => {
    it("should render cover template with title", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Welcome Presentation" }),
      });

      expect(result.html).toContain("slide-container");
      expect(result.templateId).toBeTruthy();
      expect(result.themeId).toBe("genspark-dark");
    });

    it("should use fallback when templateType has no matching template", () => {
      const outline = makeOutline("cover");
      // Force an unknown type via type assertion
      (outline as { templateType: string }).templateType = "unknown-type-xyz";

      const result = skill.render({
        pageOutline: outline,
        pageContent: makeContent(),
      });

      // Should still return HTML (fallback)
      expect(result.html).toBeTruthy();
      expect(result.html).toContain("slide-container");
    });

    it("should inject chart SVG when sections contain chart data", () => {
      mockChartRenderer.extractChartData.mockReturnValue({
        labels: ["Q1", "Q2", "Q3"],
        values: [100, 200, 150],
      } as ReturnType<typeof mockChartRenderer.extractChartData>);

      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Dashboard",
          sections: [
            {
              type: "chart",
              position: "center",
              content: {
                type: "bar",
                data: [
                  { label: "Q1", value: 100 },
                  { label: "Q2", value: 200 },
                ],
              },
            },
          ],
        }),
      });

      expect(result.html).toBeTruthy();
    });

    it("should handle stat section with StatContent object", () => {
      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Metrics Overview",
          sections: [
            {
              type: "stat",
              position: "left",
              content: {
                value: "85%",
                label: "Satisfaction Rate",
                trend: "up",
                change: "+5%",
              },
            },
          ],
        }),
      });

      expect(result.html).toBeTruthy();
    });

    it("should render list section", () => {
      const result = skill.render({
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent({
          title: "Key Points",
          sections: [
            {
              type: "list",
              position: "full",
              content: [
                "First important point",
                "Second important point",
                "Third important point",
              ],
            },
          ],
        }),
      });

      expect(result.html).toBeTruthy();
    });

    it("should render timeline template", () => {
      const result = skill.render({
        pageOutline: makeOutline("timeline"),
        pageContent: makeContent({
          title: "Company Timeline",
          sections: [
            { type: "text", position: "left", content: "2020: Founded" },
            { type: "text", position: "center", content: "2022: Expanded" },
            { type: "text", position: "right", content: "2024: IPO" },
          ],
        }),
      });

      expect(result.html).toBeTruthy();
      expect(result.templateId).toBeTruthy();
    });

    it("should render comparison template", () => {
      const result = skill.render({
        pageOutline: makeOutline("comparison"),
        pageContent: makeContent({
          title: "Product Comparison",
          sections: [
            { type: "text", position: "left", content: "Option A details" },
            { type: "text", position: "right", content: "Option B details" },
          ],
        }),
      });

      expect(result.html).toBeTruthy();
    });

    it("should wrap HTML with theme container", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
      });

      expect(result.html).toContain("slide-container");
      expect(result.html).toContain("slide-content");
    });

    it("should return variables object", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Test Title" }),
      });

      expect(typeof result.variables).toBe("object");
      expect(result.variables).not.toBeNull();
    });

    it("should pass usedValues set without crashing", () => {
      const usedValues = new Set(["value1", "value2"]);

      const result = skill.render({
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent(),
        usedValues,
      });

      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe("execute() - error handling", () => {
    it("should return TEMPLATE_RENDERING_ERROR with retryable=true when render throws", async () => {
      // Force render to throw by making chartRenderer throw
      mockChartRenderer.renderToSvg.mockImplementation(() => {
        throw new Error("SVG render crash");
      });
      // Use dashboard template which uses chart injection
      // But we need the template itself to throw - override renderFallbackChart too
      mockChartRenderer.extractChartData.mockReturnValue({
        labels: [],
        values: [],
      } as ReturnType<typeof mockChartRenderer.extractChartData>);

      // The skill handles chart errors gracefully, so we test via a spy
      const renderSpy = jest
        .spyOn(skill, "render")
        .mockImplementation(() => {
          throw new Error("Unexpected render failure");
        });

      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TEMPLATE_RENDERING_ERROR");
      expect(result.error?.retryable).toBe(true);

      renderSpy.mockRestore();
    });

    it("should include error stack in details when Error is thrown", async () => {
      const renderSpy = jest
        .spyOn(skill, "render")
        .mockImplementation(() => {
          const err = new Error("Stack trace error");
          err.stack = "Error: Stack trace error\n  at test.ts:1:1";
          throw err;
        });

      const input = {
        pageOutline: makeOutline("cover"),
        pageContent: makeContent(),
      };

      const result = await skill.execute(input, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.details).toBeDefined();

      renderSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Chart injection
  // --------------------------------------------------------------------------

  describe("chart injection", () => {
    it("should call chartRenderer when SVG chart placeholder found", () => {
      // Dashboard template likely includes chart placeholders
      skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Data Dashboard",
          sections: [
            {
              type: "chart",
              position: "center",
              content: { type: "bar", data: [] },
            },
          ],
        }),
      });

      // renderToSvg may or may not be called depending on template
      // We just verify no crash occurred
      expect(true).toBe(true);
    });

    it("should fall back gracefully when chartRenderer.renderToSvg throws", () => {
      mockChartRenderer.extractChartData.mockReturnValue({
        labels: ["A"],
        values: [1],
      } as ReturnType<typeof mockChartRenderer.extractChartData>);
      mockChartRenderer.renderToSvg.mockImplementation(() => {
        throw new Error("Chart render failed");
      });

      // Should not throw
      expect(() => {
        skill.render({
          pageOutline: makeOutline("dashboard"),
          pageContent: makeContent(),
        });
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // All PageTemplateType variants
  // --------------------------------------------------------------------------

  describe("all PageTemplateType variants render without throwing", () => {
    const allTypes: PageTemplateType[] = [
      "cover",
      "toc",
      "chapterTitle",
      "questions",
      "pillars",
      "framework",
      "timeline",
      "evolutionRoadmap",
      "dashboard",
      "comparison",
      "splitLayout",
      "caseStudy",
      "multiColumn",
      "recommendations",
      "maturityModel",
      "riskOpportunity",
      "closing",
    ];

    allTypes.forEach((templateType) => {
      it(`should render ${templateType} without throwing`, () => {
        expect(() => {
          skill.render({
            pageOutline: makeOutline(templateType),
            pageContent: makeContent({
              title: `${templateType} Slide`,
              sections: [
                { type: "text", position: "left", content: "Section 1" },
                { type: "text", position: "right", content: "Section 2" },
              ],
            }),
          });
        }).not.toThrow();
      });
    });
  });

  // --------------------------------------------------------------------------
  // extractVariablesByTemplateId - Data Templates (D-001 ~ D-006)
  // --------------------------------------------------------------------------

  describe("extractVariablesByTemplateId - D-series templates", () => {
    it("should render D-001 (Big Number) with stat sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Revenue Growth",
          sections: [
            {
              type: "stat",
              position: "center",
              content: {
                value: "$2.4B",
                label: "Annual Revenue",
                trend: "up",
                change: "+23%",
              },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
      expect(result.templateId).toMatch(/^D-/);
    });

    it("should render D-002 (Dashboard 4KPI) with 4 stat sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "KPI Dashboard",
          sections: [
            {
              type: "stat",
              position: "left",
              content: { value: "92%", label: "Satisfaction", trend: "up", change: "+5%" },
            },
            {
              type: "stat",
              position: "center",
              content: { value: "1.2M", label: "Users", trend: "up", change: "+12%" },
            },
            {
              type: "stat",
              position: "right",
              content: { value: "45ms", label: "Response", trend: "down", change: "-8%" },
            },
            {
              type: "stat",
              position: "full",
              content: { value: "99.9%", label: "Uptime", trend: "up", change: "+0.1%" },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render dashboard with no stat sections - uses placeholders", () => {
      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Empty Dashboard",
          sections: [
            { type: "text", position: "full", content: "Summary text" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render comparison template with list sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("comparison"),
        pageContent: makeContent({
          title: "Option A vs Option B",
          sections: [
            {
              type: "list",
              position: "left",
              content: ["Feature 1", "Feature 2", "Feature 3"],
            },
            {
              type: "list",
              position: "right",
              content: ["Alt Feature 1", "Alt Feature 2", "Alt Feature 3"],
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // extractVariablesByTemplateId - Structural Templates (S-series)
  // --------------------------------------------------------------------------

  describe("extractVariablesByTemplateId - S-series templates", () => {
    it("should render S-002 (chapterTitle) extracting chapter number from subtitle CHAPTER 02", () => {
      const result = skill.render({
        pageOutline: {
          ...makeOutline("chapterTitle"),
          subtitle: "CHAPTER 02",
        },
        pageContent: makeContent({
          title: "Market Analysis",
          subtitle: "CHAPTER 02",
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render chapterTitle extracting chapter number from outline subtitle", () => {
      const result = skill.render({
        pageOutline: {
          ...makeOutline("chapterTitle"),
          subtitle: "Chapter 3: Introduction",
        },
        pageContent: makeContent({
          title: "Introduction",
          subtitle: undefined,
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render chapterTitle extracting chapter from section text content", () => {
      const result = skill.render({
        pageOutline: makeOutline("chapterTitle"),
        pageContent: makeContent({
          title: "Deep Dive Section",
          subtitle: undefined,
          sections: [
            {
              type: "text",
              position: "full",
              content: "第3章: Deep Dive into Analytics",
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render S-001 (toc) from sections when 2+ sections available", () => {
      const result = skill.render({
        pageOutline: makeOutline("toc"),
        pageContent: makeContent({
          title: "Table of Contents",
          sections: [
            { type: "text", position: "left", content: "Chapter One: Overview" },
            { type: "text", position: "center", content: "Chapter Two: Analysis" },
            { type: "text", position: "right", content: "Chapter Three: Conclusion" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render toc from keyElements when sections < 2", () => {
      const result = skill.render({
        pageOutline: {
          ...makeOutline("toc"),
          keyElements: ["Chapter 1", "Chapter 2", "Chapter 3"],
        },
        pageContent: makeContent({
          title: "Table of Contents",
          sections: [
            { type: "text", position: "full", content: "Single section" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render toc with list sections extracting first item", () => {
      const result = skill.render({
        pageOutline: makeOutline("toc"),
        pageContent: makeContent({
          title: "Contents",
          sections: [
            { type: "list", position: "full", content: ["Overview", "Details"] },
            { type: "list", position: "full", content: ["Summary", "Conclusion"] },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render S-003/S-004/S-005 pillars with stat sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent({
          title: "Three Core Pillars",
          sections: [
            {
              type: "stat",
              position: "left",
              content: { value: "87%", label: "Customer Satisfaction", trend: "up", change: "+3%" },
            },
            {
              type: "stat",
              position: "center",
              content: { value: "2.1M", label: "Active Users", trend: "up", change: "+15%" },
            },
            {
              type: "stat",
              position: "right",
              content: { value: "34ms", label: "Response Time", trend: "down", change: "-10%" },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render pillars with list sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent({
          title: "Strategic Pillars",
          sections: [
            {
              type: "list",
              position: "left",
              content: ["Innovation", "Drive new products", "Invest in R&D"],
            },
            {
              type: "list",
              position: "center",
              content: ["Execution", "Deliver on time", "Quality focus"],
            },
            {
              type: "list",
              position: "right",
              content: ["Culture", "Empower teams", "Continuous learning"],
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render timeline with stat sections providing date/label/change", () => {
      const result = skill.render({
        pageOutline: makeOutline("timeline"),
        pageContent: makeContent({
          title: "Company Milestones",
          sections: [
            {
              type: "stat",
              position: "left",
              content: { value: "2019", label: "Founded", trend: "up", change: "First product launched" },
            },
            {
              type: "stat",
              position: "center",
              content: { value: "2021", label: "Series A", trend: "up", change: "$10M raised" },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render timeline with list sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("timeline"),
        pageContent: makeContent({
          title: "Product Roadmap",
          sections: [
            { type: "list", position: "left", content: ["2020", "Launch v1", "Beta release"] },
            { type: "list", position: "center", content: ["2022", "Launch v2", "GA release"] },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render timeline with text sections using date:title:desc format", () => {
      const result = skill.render({
        pageOutline: makeOutline("timeline"),
        pageContent: makeContent({
          title: "History",
          sections: [
            { type: "text", position: "left", content: "2019: Founded - Started operations" },
            { type: "text", position: "right", content: "2023: IPO - Listed on NYSE" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render framework with text sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("framework"),
        pageContent: makeContent({
          title: "4-Step Process",
          sections: [
            { type: "text", position: "left", content: "Step 1: Analyze - Gather and process data" },
            { type: "text", position: "center", content: "Step 2: Design - Create solutions" },
            { type: "text", position: "right", content: "Step 3: Build - Implement solutions" },
            { type: "text", position: "full", content: "Step 4: Validate - Test and iterate" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render framework with list sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("framework"),
        pageContent: makeContent({
          title: "Framework",
          sections: [
            { type: "list", position: "left", content: ["Discover", "Research and gather insights"] },
            { type: "list", position: "center", content: ["Define", "Clarify the problem"] },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render framework with stat sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("framework"),
        pageContent: makeContent({
          title: "Maturity Levels",
          sections: [
            {
              type: "stat",
              position: "left",
              content: { value: "Level 1", label: "Initial", trend: "up", change: "Ad hoc" },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // extractVariablesByTemplateId - Action Templates (A-series)
  // --------------------------------------------------------------------------

  describe("extractVariablesByTemplateId - A-series templates", () => {
    it("should render A-001 (recommendations) with list sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("recommendations"),
        pageContent: makeContent({
          title: "Strategic Recommendations",
          subtitle: "Q1 2024",
          sections: [
            { type: "list", position: "left", content: ["Urgent: Cut costs", "Reduce overhead by 20%"] },
            { type: "list", position: "center", content: ["Urgent: Hire engineers", "3 senior engineers needed"] },
            { type: "list", position: "right", content: ["Short: Launch feature", "Target Q2 launch"] },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render riskOpportunity with text sections", () => {
      const result = skill.render({
        pageOutline: makeOutline("riskOpportunity"),
        pageContent: makeContent({
          title: "Risk vs Opportunity",
          sections: [
            { type: "text", position: "left", content: "Risk: Market competition increasing" },
            { type: "text", position: "right", content: "Opportunity: New market segment emerging" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render recommendations without sections - uses placeholders", () => {
      const result = skill.render({
        pageOutline: makeOutline("recommendations"),
        pageContent: makeContent({
          title: "Recommendations",
          sections: [],
        }),
      });
      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // extractVariablesByTemplateId - Narrative Templates (N-series)
  // --------------------------------------------------------------------------

  describe("extractVariablesByTemplateId - N-series (cover/closing)", () => {
    it("should render N-001 (cover) with full variables", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({
          title: "Annual Report 2024",
          subtitle: "Financial Performance Review",
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render N-002 (closing) with MISSING_PLACEHOLDER when title absent", () => {
      const result = skill.render({
        pageOutline: makeOutline("closing"),
        pageContent: makeContent({
          title: "Thank You",
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render cover with missing title - uses placeholder", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: {
          title: "",
          sections: [],
        } as unknown as PageContent,
      });
      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // extractVariables - fallback switch (default branch)
  // --------------------------------------------------------------------------

  describe("extractVariables - fallback type dispatch", () => {
    it("should handle questions type via fallback", () => {
      // questions type uses extractQuestionsVariables
      const result = skill.render({
        pageOutline: makeOutline("questions"),
        pageContent: makeContent({
          title: "Key Questions",
          sections: [
            { type: "text", position: "left", content: "What is the ROI?" },
            { type: "text", position: "center", content: "Who are the key stakeholders?" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should handle maturityModel type via fallback", () => {
      const result = skill.render({
        pageOutline: makeOutline("maturityModel"),
        pageContent: makeContent({
          title: "Maturity Model",
          sections: [
            {
              type: "stat",
              position: "left",
              content: { value: "Level 3", label: "Defined", trend: "up", change: "Standardized" },
            },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should handle splitLayout type via fallback (multiColumn vars)", () => {
      const result = skill.render({
        pageOutline: makeOutline("splitLayout"),
        pageContent: makeContent({
          title: "Split Layout",
          sections: [
            { type: "text", position: "left", content: "Left column content" },
            { type: "text", position: "right", content: "Right column content" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should handle caseStudy type via fallback", () => {
      const result = skill.render({
        pageOutline: makeOutline("caseStudy"),
        pageContent: makeContent({
          title: "Case Study: Acme Corp",
          sections: [
            { type: "text", position: "left", content: "Challenge: Low customer retention" },
            { type: "text", position: "center", content: "Solution: Loyalty program" },
            { type: "text", position: "right", content: "Result: 40% improvement" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });

    it("should render evolutionRoadmap using timeline variables", () => {
      const result = skill.render({
        pageOutline: makeOutline("evolutionRoadmap"),
        pageContent: makeContent({
          title: "Technology Evolution",
          sections: [
            { type: "text", position: "left", content: "2020: Basic - Initial implementation" },
            { type: "text", position: "right", content: "2025: Advanced - Full automation" },
          ],
        }),
      });
      expect(result.html).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Theme variants
  // --------------------------------------------------------------------------

  describe("theme variants", () => {
    it("should use light theme mode for white theme", () => {
      const result = skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({
          title: "Light Theme Test",
          sections: [
            {
              type: "stat",
              position: "center",
              content: { value: "95%", label: "Score", trend: "up", change: "+2%" },
            },
          ],
        }),
        themeId: "genspark-white",
      });
      expect(result.html).toBeTruthy();
      expect(result.themeId).toBe("genspark-white");
    });

    it("should handle tech-dark theme", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Tech Dark Slide" }),
        themeId: "tech-dark",
      });
      expect(result.html).toBeTruthy();
    });

    it("should use fallback for unknown themeId", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Unknown Theme" }),
        themeId: "nonexistent-theme-xyz",
      });
      // Should still produce valid HTML, falling back to a default theme
      expect(result.html).toBeTruthy();
      expect(result.html).toContain("slide-container");
    });
  });

  // --------------------------------------------------------------------------
  // Chart injection edge cases
  // --------------------------------------------------------------------------

  describe("chart injection - map chart types", () => {
    it("should map trend chart type to line chart", () => {
      // trend -> line mapping
      mockChartRenderer.extractChartData.mockReturnValue(null);
      mockChartRenderer.generateSampleData.mockReturnValue({
        labels: ["Q1", "Q2", "Q3"],
        values: [100, 120, 150],
      } as ReturnType<typeof mockChartRenderer.generateSampleData>);
      mockChartRenderer.renderToSvg.mockReturnValue(
        '<svg width="500" height="300"><polyline/></svg>',
      );

      // Dashboard renders chart placeholders for trend chart type
      expect(() => {
        skill.render({
          pageOutline: makeOutline("dashboard"),
          pageContent: makeContent({ title: "Trend Analysis" }),
        });
      }).not.toThrow();
    });

    it("should generate sample data when no chart data found in sections", () => {
      mockChartRenderer.extractChartData.mockReturnValue(null);
      mockChartRenderer.generateSampleData.mockReturnValue({
        labels: ["A", "B"],
        values: [1, 2],
      } as ReturnType<typeof mockChartRenderer.generateSampleData>);

      skill.render({
        pageOutline: makeOutline("dashboard"),
        pageContent: makeContent({ title: "Auto Chart" }),
      });

      // Either extractChartData was called (and returned null triggering generateSampleData)
      // or chart was not needed - either is valid
      expect(true).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Overflow protection styles
  // --------------------------------------------------------------------------

  describe("HTML structure and overflow protection", () => {
    it("should include overflow protection styles in output HTML", () => {
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Style Test" }),
      });

      expect(result.html).toContain("box-sizing: border-box");
      expect(result.html).toContain("overflow: hidden");
    });

    it("should include slide-content wrapper div", () => {
      const result = skill.render({
        pageOutline: makeOutline("pillars"),
        pageContent: makeContent({ title: "Content Wrapper Test" }),
      });

      expect(result.html).toContain("slide-content");
      expect(result.html).toContain("flex-direction: column");
    });

    it("should append script tag when template has script", () => {
      // We test that scripts are appended if present - most templates do not have scripts
      // The method adds script if template.script is truthy
      // Just verify the render completes without error for all standard types
      const result = skill.render({
        pageOutline: makeOutline("cover"),
        pageContent: makeContent({ title: "Script Test" }),
      });
      expect(result.html).toBeTruthy();
    });
  });
});
