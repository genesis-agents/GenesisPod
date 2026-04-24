import { describe, it, expect } from "@jest/globals";
import { resolveResearchDepthConfig } from "../research-depth.types";

describe("V5 Research Types", () => {
  describe("resolveResearchDepthConfig", () => {
    it("quick → knowledgeIterations=1, all flags false", () => {
      const config = resolveResearchDepthConfig("quick");
      expect(config.knowledgeIterations).toBe(1);
      expect(config.crossValidationEnabled).toBe(false);
      expect(config.hypothesisTestingEnabled).toBe(false);
      expect(config.factCheckEnabled).toBe(false);
      expect(config.literatureBaselineEnabled).toBe(false);
      expect(config.maxCognitiveLoops).toBe(0);
      expect(config.maxRevisionRounds).toBe(0);
    });

    it("standard → knowledgeIterations=2, crossValidation+hypothesisTesting true, factCheck false", () => {
      const config = resolveResearchDepthConfig("standard");
      expect(config.knowledgeIterations).toBe(2);
      expect(config.crossValidationEnabled).toBe(true);
      expect(config.hypothesisTestingEnabled).toBe(true);
      expect(config.factCheckEnabled).toBe(false);
      expect(config.literatureBaselineEnabled).toBe(true);
    });

    it("thorough → knowledgeIterations=3, all flags true", () => {
      const config = resolveResearchDepthConfig("thorough");
      expect(config.knowledgeIterations).toBe(3);
      expect(config.crossValidationEnabled).toBe(true);
      expect(config.hypothesisTestingEnabled).toBe(true);
      expect(config.factCheckEnabled).toBe(true);
      expect(config.literatureBaselineEnabled).toBe(true);
    });
  });

  // H6 step 14: buildValidationContextForWriting describe removed with
  // research-depth.prompt.ts (orphan — harness specs own their own prompts).
});
