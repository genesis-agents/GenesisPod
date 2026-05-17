/**
 * Role services barrel for ai-app/social.
 *
 * 9 role services（LeaderService / StewardService / PlatformProbeService /
 * ContentTransformerService / CoverArtistService / ComposerService /
 * PolishReviewerService / PublishExecutorAgentService / PublishVerifierService）
 * + SocialAgentInvoker（thin AgentRunner wrapper with "social" event namespace）.
 */
export {
  SocialAgentInvoker,
  extractTokenSpend,
  type SocialInvocationContext,
} from "./social-agent-invoker.service";
export { SocialEventRelay } from "./social-event-relay";
export {
  normalizeRunnerState,
  type NormalizedRunnerState,
} from "./runner-state.util";

export { LeaderService } from "./leader.service";
export { StewardService } from "./steward.service";
export { PlatformProbeService } from "./platform-probe.service";
export { ContentTransformerService } from "./content-transformer.service";
export { CoverArtistService } from "./cover-artist.service";
export { ComposerService } from "./composer.service";
export { PolishReviewerService } from "./polish-reviewer.service";
export { PublishExecutorAgentService } from "./publish-executor.service";
export { PublishVerifierService } from "./publish-verifier.service";

export type { LeaderInvocationResult } from "./leader.service";
export type { StewardInvocationResult } from "./steward.service";
export type { PlatformProbeInvocationResult } from "./platform-probe.service";
export type { ContentTransformerInvocationResult } from "./content-transformer.service";
export type { CoverArtistInvocationResult } from "./cover-artist.service";
export type { ComposerInvocationResult } from "./composer.service";
export type { PolishReviewerInvocationResult } from "./polish-reviewer.service";
export type { PublishExecutorInvocationResult } from "./publish-executor.service";
export type { PublishVerifierInvocationResult } from "./publish-verifier.service";
