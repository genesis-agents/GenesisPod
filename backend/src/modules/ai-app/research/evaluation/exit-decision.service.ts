import { Injectable } from "@nestjs/common";

export interface ExitDecision {
  exit: boolean;
  reason?:
    | "budget_exhausted"
    | "quality_met"
    | "information_saturated"
    | "converged"
    | "no_gaps";
  nextResearchFocus?: string[];
}

export interface ExitContext {
  iteration: number;
  depth: "quick" | "standard" | "thorough";
  /** Scores from each completed iteration, in order */
  scores: number[];
  /** New unique sources / total sources searched this round */
  informationGain: number;
  gaps: {
    dataGaps: string[];
    ideaGaps: string[];
  };
}

const MAX_ITERATIONS: Record<ExitContext["depth"], number> = {
  quick: 2,
  standard: 4,
  thorough: 6,
};

const QUALITY_THRESHOLD: Record<ExitContext["depth"], number> = {
  quick: 0.6,
  standard: 0.75,
  thorough: 0.85,
};

const SATURATION_GAIN_THRESHOLD = 0.1;
const CONVERGENCE_DELTA_THRESHOLD = 0.03;

@Injectable()
export class ExitDecisionService {
  decide(context: ExitContext): ExitDecision {
    const { iteration, depth, gaps } = context;
    // Sanitize scores: filter out NaN/Infinity
    const scores = context.scores.filter((s) => isFinite(s));
    const informationGain = isFinite(context.informationGain)
      ? context.informationGain
      : 0;
    const latestScore = scores.length > 0 ? scores[scores.length - 1] : 0;

    // 1. Budget exhausted: iteration count hit the depth maximum
    if (iteration >= MAX_ITERATIONS[depth]) {
      return { exit: true, reason: "budget_exhausted" };
    }

    // 2. Quality met: latest score is at or above the depth threshold
    if (latestScore >= QUALITY_THRESHOLD[depth]) {
      return { exit: true, reason: "quality_met" };
    }

    // 3. No gaps remaining: both gap lists are empty
    const hasNoGaps = gaps.dataGaps.length === 0 && gaps.ideaGaps.length === 0;
    if (hasNoGaps) {
      return { exit: true, reason: "no_gaps" };
    }

    // 4. Information saturated: this round added very few new unique sources
    if (informationGain < SATURATION_GAIN_THRESHOLD) {
      return { exit: true, reason: "information_saturated" };
    }

    // 5. Converged: last 2 score deltas are both below the convergence threshold
    if (scores.length >= 3) {
      const delta1 = Math.abs(
        scores[scores.length - 1] - scores[scores.length - 2],
      );
      const delta2 = Math.abs(
        scores[scores.length - 2] - scores[scores.length - 3],
      );
      if (
        delta1 < CONVERGENCE_DELTA_THRESHOLD &&
        delta2 < CONVERGENCE_DELTA_THRESHOLD
      ) {
        return { exit: true, reason: "converged" };
      }
    }

    // Continue: provide next research focus from remaining gaps (deduplicated)
    const nextResearchFocus = [
      ...new Set([...gaps.dataGaps, ...gaps.ideaGaps]),
    ];

    return { exit: false, nextResearchFocus };
  }
}
