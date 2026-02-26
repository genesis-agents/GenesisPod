/**
 * AI Engine - Teams Abstractions
 * 团队抽象层导出
 */

export * from "./team.interface";
export * from "./role.interface";
export * from "./member.interface";
export * from "./workflow.interface";
export * from "./mission.interface";
export * from "./a2a-message.interface";
export * from "./constraint-profile";
// constraint-engine.interface is kept in core but NOT barrel-exported here
// to avoid TS2308 ambiguity with backend teams/constraints/index.ts which
// also re-exports these types alongside the ConstraintEngine implementation class.
export * from "./mission-context.interface";
