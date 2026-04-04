/**
 * AI Engine - Permission Middleware
 * 权限检查中间件
 *
 * Pre-execution permission check. Runs early in the middleware chain (priority 5)
 * so that unauthorised calls are rejected before any validation or timeout overhead.
 *
 * Default behaviour: allow all. Consumers can extend or replace this middleware
 * with a CapabilityGuardService integration when role/scope enforcement is needed.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolContext } from "../abstractions/tool.interface";
import { IToolMiddleware } from "./middleware.interface";

/**
 * PermissionMiddleware
 *
 * Implements IToolMiddleware with priority 5 (runs before ValidationMiddleware at 10
 * and TimeoutMiddleware at 20).
 *
 * The `before` hook returns void on success. Throw an error to deny execution.
 */
@Injectable()
export class PermissionMiddleware implements IToolMiddleware {
  readonly name = "permission";
  readonly priority = 5;

  private readonly logger = new Logger(PermissionMiddleware.name);

  /**
   * Check whether the caller has permission to execute this tool.
   *
   * Default implementation permits all calls. Override `isAllowed` in a subclass
   * or replace this middleware with a custom implementation to enforce access control.
   *
   * @throws Error if access is denied
   */
  async before(
    _input: unknown,
    context: ToolContext,
    tool: ITool,
  ): Promise<void> {
    const allowed = await this.isAllowed(context, tool);

    if (!allowed.permitted) {
      const reason = allowed.reason ?? "Permission denied";
      this.logger.warn(
        `[permission_denied] tool=${tool.id} userId=${context.userId ?? "anonymous"} reason=${reason}`,
      );
      throw new Error(`[PermissionMiddleware] ${reason}`);
    }

    this.logger.debug(
      `[permission_granted] tool=${tool.id} userId=${context.userId ?? "anonymous"}`,
    );
  }

  /**
   * Determine whether this tool call is permitted.
   *
   * Override this method to integrate with CapabilityGuardService, RBAC, or any
   * other access-control mechanism.
   *
   * @returns `{ permitted: true }` to allow, `{ permitted: false, reason }` to deny
   */
  protected isAllowed(
    _context: ToolContext,
    _tool: ITool,
  ): Promise<{ permitted: boolean; reason?: string }> {
    // Default: opt-in model — all tools are permitted until a guard is registered
    return Promise.resolve({ permitted: true });
  }
}
