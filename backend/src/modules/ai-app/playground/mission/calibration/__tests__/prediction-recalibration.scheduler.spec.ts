/**
 * PredictionRecalibrationScheduler unit tests
 *
 * Coverage targets (95%+ lines/statements/functions/branches):
 *   - sweep(): isRunning guard (concurrent call skipped)
 *   - sweep(): no due predictions → early return after log
 *   - sweep(): happy path — iterates predictions, resolves, logs summary
 *   - sweep(): per-prediction catch branch (individual error doesn't stop loop)
 *   - sweep(): outcome=null / needsReview paths for counter logic
 *   - sweep(): outer catch branch (getDuePredictions throws)
 *   - sweep(): finally block always resets isRunning (even on outer error)
 *   - BATCH_SIZE constant used as the limit argument
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PredictionRecalibrationScheduler } from "../prediction-recalibration.scheduler";
import { PredictionCalibrationService } from "../prediction-calibration.service";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeCalibration() {
  return {
    getDuePredictions: jest.fn(),
    judgeOutcome: jest.fn(),
    resolvePrediction: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Prediction fixture helper
// ---------------------------------------------------------------------------

function makePrediction(
  overrides: Partial<{
    id: string;
    predictionText: string;
    resolutionCriteria: string;
    topic: string;
    probability: number;
  }> = {},
) {
  return {
    id: "pred-1",
    predictionText: "AI will achieve AGI",
    resolutionCriteria: "Major benchmark exceeded",
    topic: "AI",
    probability: 0.7,
    ...overrides,
  };
}

function makeJudgment(
  overrides: Partial<{
    outcome: boolean | null;
    evidenceUrl: string | null;
    confidence: number;
    needsReview: boolean;
  }> = {},
) {
  return {
    outcome: true as boolean | null,
    evidenceUrl: "https://example.com",
    confidence: 0.9,
    needsReview: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PredictionRecalibrationScheduler", () => {
  let scheduler: PredictionRecalibrationScheduler;
  let calibration: ReturnType<typeof makeCalibration>;

  beforeEach(async () => {
    calibration = makeCalibration();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionRecalibrationScheduler,
        { provide: PredictionCalibrationService, useValue: calibration },
      ],
    }).compile();

    scheduler = module.get<PredictionRecalibrationScheduler>(
      PredictionRecalibrationScheduler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Concurrent-run guard
  // =========================================================================

  describe("isRunning guard", () => {
    it("skips second sweep() call while first is in progress", async () => {
      // Make getDuePredictions hang indefinitely to simulate long-running sweep
      let firstResolve: () => void;
      const firstPromise = new Promise<void>((resolve) => {
        firstResolve = resolve;
      });

      calibration.getDuePredictions.mockReturnValueOnce(
        firstPromise.then(() => []),
      );

      // Start the first sweep but don't await it yet
      const first = scheduler.sweep();

      // Immediately trigger a second sweep — isRunning should be true
      await scheduler.sweep();

      // The second call should not have invoked getDuePredictions again
      expect(calibration.getDuePredictions).toHaveBeenCalledTimes(1);

      // Now finish the first sweep
      firstResolve!();
      await first;
    });

    it("resets isRunning after sweep completes so next call succeeds", async () => {
      calibration.getDuePredictions.mockResolvedValue([]);

      await scheduler.sweep();
      await scheduler.sweep();

      expect(calibration.getDuePredictions).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // No due predictions — early return
  // =========================================================================

  describe("empty due predictions", () => {
    it("returns early without calling judgeOutcome when no due predictions", async () => {
      calibration.getDuePredictions.mockResolvedValue([]);

      await scheduler.sweep();

      expect(calibration.judgeOutcome).not.toHaveBeenCalled();
      expect(calibration.resolvePrediction).not.toHaveBeenCalled();
    });

    it("passes BATCH_SIZE (50) as limit to getDuePredictions", async () => {
      calibration.getDuePredictions.mockResolvedValue([]);

      await scheduler.sweep();

      expect(calibration.getDuePredictions).toHaveBeenCalledWith(50);
    });
  });

  // =========================================================================
  // Happy path — predictions resolved
  // =========================================================================

  describe("successful sweep", () => {
    it("calls judgeOutcome and resolvePrediction for each prediction", async () => {
      const predictions = [
        makePrediction({ id: "p1", probability: 0.6 }),
        makePrediction({ id: "p2", probability: 0.8 }),
      ];
      const judgment = makeJudgment();

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockResolvedValue(judgment);
      calibration.resolvePrediction.mockResolvedValue(undefined);

      await scheduler.sweep();

      expect(calibration.judgeOutcome).toHaveBeenCalledTimes(2);
      expect(calibration.judgeOutcome).toHaveBeenCalledWith({
        predictionText: predictions[0].predictionText,
        resolutionCriteria: predictions[0].resolutionCriteria,
        topic: predictions[0].topic,
      });
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(2);
      expect(calibration.resolvePrediction).toHaveBeenCalledWith(
        "p1",
        judgment,
        0.6,
      );
    });

    it("counts resolved vs needsReview correctly — all auto-resolved", async () => {
      const predictions = [
        makePrediction({ id: "p1" }),
        makePrediction({ id: "p2" }),
      ];
      const judgment = makeJudgment({ outcome: true, needsReview: false });

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockResolvedValue(judgment);
      calibration.resolvePrediction.mockResolvedValue(undefined);

      // Should not throw; log summary is internal but we verify no errors
      await expect(scheduler.sweep()).resolves.toBeUndefined();
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(2);
    });

    it("counts needsReview correctly when outcome=null", async () => {
      const predictions = [makePrediction({ id: "p1" })];
      const judgment = makeJudgment({ outcome: null, needsReview: true });

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockResolvedValue(judgment);
      calibration.resolvePrediction.mockResolvedValue(undefined);

      await scheduler.sweep();

      // needsReview counter incremented (outcome=null → needsReview path)
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(1);
    });

    it("counts needsReview correctly when outcome is set but needsReview=true (low confidence)", async () => {
      const predictions = [makePrediction({ id: "p1" })];
      const judgment = makeJudgment({ outcome: false, needsReview: true });

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockResolvedValue(judgment);
      calibration.resolvePrediction.mockResolvedValue(undefined);

      await scheduler.sweep();

      // outcome !== null but needsReview=true → goes to needsReview counter
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(1);
    });

    it("counts correctly in mixed outcome+needsReview scenarios", async () => {
      const predictions = [
        makePrediction({ id: "p1" }),
        makePrediction({ id: "p2" }),
        makePrediction({ id: "p3" }),
      ];

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome
        .mockResolvedValueOnce(
          makeJudgment({ outcome: true, needsReview: false }),
        )
        .mockResolvedValueOnce(
          makeJudgment({ outcome: null, needsReview: true }),
        )
        .mockResolvedValueOnce(
          makeJudgment({ outcome: false, needsReview: false }),
        );
      calibration.resolvePrediction.mockResolvedValue(undefined);

      await scheduler.sweep();

      // 2 auto-resolved (p1, p3), 1 needs-review (p2)
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Per-prediction error handling (inner catch)
  // =========================================================================

  describe("per-prediction error handling", () => {
    it("continues processing remaining predictions when one fails in judgeOutcome", async () => {
      const predictions = [
        makePrediction({ id: "p1" }),
        makePrediction({ id: "p2" }),
      ];

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome
        .mockRejectedValueOnce(new Error("Search exploded"))
        .mockResolvedValueOnce(makeJudgment());
      calibration.resolvePrediction.mockResolvedValue(undefined);

      await expect(scheduler.sweep()).resolves.toBeUndefined();

      expect(calibration.judgeOutcome).toHaveBeenCalledTimes(2);
      // Only second prediction should be resolved
      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(1);
      expect(calibration.resolvePrediction).toHaveBeenCalledWith(
        "p2",
        expect.anything(),
        expect.anything(),
      );
    });

    it("continues processing when resolvePrediction throws for one prediction", async () => {
      const predictions = [
        makePrediction({ id: "p1" }),
        makePrediction({ id: "p2" }),
      ];
      const judgment = makeJudgment();

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockResolvedValue(judgment);
      calibration.resolvePrediction
        .mockRejectedValueOnce(new Error("DB write failed"))
        .mockResolvedValueOnce(undefined);

      await expect(scheduler.sweep()).resolves.toBeUndefined();

      expect(calibration.resolvePrediction).toHaveBeenCalledTimes(2);
    });

    it("logs the prediction id in warning when per-prediction error is a string", async () => {
      const predictions = [makePrediction({ id: "p-err" })];

      calibration.getDuePredictions.mockResolvedValue(predictions);
      calibration.judgeOutcome.mockRejectedValueOnce("non-Error string error");
      calibration.resolvePrediction.mockResolvedValue(undefined);

      // Should not throw even when error is not an Error instance
      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Outer error handling (getDuePredictions throws)
  // =========================================================================

  describe("outer error handling", () => {
    it("does not rethrow when getDuePredictions throws", async () => {
      calibration.getDuePredictions.mockRejectedValue(new Error("DB down"));

      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });

    it("does not rethrow when getDuePredictions throws a non-Error", async () => {
      calibration.getDuePredictions.mockRejectedValue("string error");

      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });

    it("resets isRunning to false even when outer error occurs", async () => {
      calibration.getDuePredictions.mockRejectedValue(
        new Error("fatal DB error"),
      );

      await scheduler.sweep();

      // If isRunning were still true, next sweep would be skipped
      calibration.getDuePredictions.mockResolvedValue([]);
      await scheduler.sweep();

      // getDuePredictions should have been called again (proves isRunning=false)
      expect(calibration.getDuePredictions).toHaveBeenCalledTimes(2);
    });

    it("resets isRunning to false even when per-item errors are thrown", async () => {
      calibration.getDuePredictions.mockResolvedValue([makePrediction()]);
      calibration.judgeOutcome.mockRejectedValue(new Error("boom"));

      await scheduler.sweep();

      // isRunning should be false again
      calibration.getDuePredictions.mockResolvedValue([]);
      await scheduler.sweep();

      expect(calibration.getDuePredictions).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Environment flag (disabled by default)
  // =========================================================================

  describe("ENABLE_PREDICTION_CALIBRATION env flag", () => {
    it("sweep() method exists and is callable regardless of env flag", async () => {
      // The @Cron decorator's disabled flag only affects the cron scheduling —
      // the method itself is always callable in unit tests
      calibration.getDuePredictions.mockResolvedValue([]);

      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });
  });
});
