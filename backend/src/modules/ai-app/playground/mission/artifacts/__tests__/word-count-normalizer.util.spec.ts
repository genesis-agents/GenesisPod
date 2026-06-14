/**
 * word-count-normalizer.util.ts — branch coverage
 *
 * Covers:
 *   - normalizeTargetWords: delegates to balanceTargetWords with PLAYGROUND_OPTS
 *   - normalizeTargetWords: fallbackMedian default = 1000
 *   - normalizeTargetWords: custom fallbackMedian
 *   - The PLAYGROUND_OPTS (absoluteMin=500, maxFloor=8000, absoluteMax=12000) are forwarded
 *
 * The balanceTargetWords from harness is mocked so we can verify the call signature.
 */

jest.mock("@/modules/ai-harness/facade", () => ({
  balanceTargetWords: jest.fn((raw, fallbackMedian, opts) => ({
    raw,
    fallbackMedian,
    opts,
    normalized: raw,
    median: fallbackMedian,
  })),
}));

import { normalizeTargetWords } from "../word-count-normalizer.util";

describe("normalizeTargetWords", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to balanceTargetWords with default fallbackMedian=1000", () => {
    const { balanceTargetWords } = require("@/modules/ai-harness/facade");
    const raw = { chapterA: 800, chapterB: 1200 };
    normalizeTargetWords(raw);
    expect(balanceTargetWords).toHaveBeenCalledWith(raw, 1000, {
      absoluteMin: 500,
      maxFloor: 8000,
      absoluteMax: 12000,
    });
  });

  it("passes custom fallbackMedian to balanceTargetWords", () => {
    const { balanceTargetWords } = require("@/modules/ai-harness/facade");
    const raw = { chapterA: 2000 };
    normalizeTargetWords(raw, 1500);
    expect(balanceTargetWords).toHaveBeenCalledWith(raw, 1500, {
      absoluteMin: 500,
      maxFloor: 8000,
      absoluteMax: 12000,
    });
  });

  it("returns result from balanceTargetWords", () => {
    const { balanceTargetWords } = require("@/modules/ai-harness/facade");
    balanceTargetWords.mockReturnValueOnce({
      normalized: { chapterA: 900 },
      median: 900,
    });
    const result = normalizeTargetWords({ chapterA: 900 });
    expect(result).toEqual({ normalized: { chapterA: 900 }, median: 900 });
  });

  it("passes PLAYGROUND_OPTS with absoluteMin=500 maxFloor=8000 absoluteMax=12000", () => {
    const { balanceTargetWords } = require("@/modules/ai-harness/facade");
    normalizeTargetWords({ x: 1000 });
    const optsArg = balanceTargetWords.mock.calls[0][2];
    expect(optsArg.absoluteMin).toBe(500);
    expect(optsArg.maxFloor).toBe(8000);
    expect(optsArg.absoluteMax).toBe(12000);
  });

  it("works with empty record", () => {
    const { balanceTargetWords } = require("@/modules/ai-harness/facade");
    normalizeTargetWords({});
    expect(balanceTargetWords).toHaveBeenCalledWith(
      {},
      1000,
      expect.any(Object),
    );
  });
});
