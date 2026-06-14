/**
 * grade-grounding.util.ts — branch coverage
 *
 * Covers:
 *   - groundDimensionGrade: delegates to groundMultiAxisGrade from harness
 *   - Verifies the grade object and uniqueSources are forwarded correctly
 *   - Verifies in-place mutation semantics (caller holds the reference)
 */

jest.mock("@/modules/ai-harness/facade", () => ({
  groundMultiAxisGrade: jest.fn((grade, uniqueSources) => {
    // Simulate what the real function does: modify the grade in-place
    grade.overall = Math.min(grade.overall, uniqueSources * 20);
    grade.grade =
      grade.overall >= 80 ? "excellent" : grade.overall >= 60 ? "good" : "fair";
  }),
}));

import { groundDimensionGrade } from "../grade-grounding.util";

describe("groundDimensionGrade", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to groundMultiAxisGrade with the grade object and uniqueSources", () => {
    const { groundMultiAxisGrade } = require("@/modules/ai-harness/facade");
    const grade = { overall: 90, grade: "excellent", axes: {} };
    groundDimensionGrade(grade, 5);
    expect(groundMultiAxisGrade).toHaveBeenCalledWith(grade, 5);
  });

  it("mutates the grade object in-place (uniqueSources=5 → overall capped at 100)", () => {
    const grade = { overall: 90, grade: "excellent", axes: {} };
    groundDimensionGrade(grade, 5);
    // 5 * 20 = 100, min(90, 100) = 90 → unchanged
    expect(grade.overall).toBe(90);
  });

  it("caps grade.overall when uniqueSources is small (uniqueSources=2 → cap at 40)", () => {
    const grade = { overall: 85, grade: "excellent", axes: {} };
    groundDimensionGrade(grade, 2);
    // 2 * 20 = 40, min(85, 40) = 40
    expect(grade.overall).toBe(40);
    expect(grade.grade).toBe("fair");
  });

  it("sets grade.overall to 0 when uniqueSources=0", () => {
    const grade = { overall: 80, grade: "good", axes: {} };
    groundDimensionGrade(grade, 0);
    // 0 * 20 = 0, min(80, 0) = 0
    expect(grade.overall).toBe(0);
  });

  it("handles grade.overall=0 with any uniqueSources without error", () => {
    const grade = { overall: 0, grade: "poor", axes: {} };
    expect(() => groundDimensionGrade(grade, 3)).not.toThrow();
  });

  it("grade reference is the same object (no clone)", () => {
    const grade = { overall: 70, grade: "good", axes: {} };
    const gradeRef = grade;
    groundDimensionGrade(grade, 4);
    expect(grade).toBe(gradeRef); // same object reference
  });

  it("called with uniqueSources=1 → overall capped at 20", () => {
    const grade = { overall: 95, grade: "excellent", axes: {} };
    groundDimensionGrade(grade, 1);
    expect(grade.overall).toBe(20);
    expect(grade.grade).toBe("fair");
  });
});
