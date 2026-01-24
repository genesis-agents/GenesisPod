/**
 * Deprecated Execution Tools
 *
 * ============================================================================
 * WARNING: THESE TOOLS ARE DISABLED FOR SECURITY REASONS
 * ============================================================================
 *
 * These tools have been moved here because they pose significant
 * Remote Code Execution (RCE) risks.
 *
 * DO NOT import or use these tools in production code.
 *
 * If you need code execution capabilities, use ContainerExecutorTool
 * from the execution category instead.
 *
 * See README.md in this directory for more information.
 * ============================================================================
 */

// ============================================================================
// DEPRECATED Tool Classes - DO NOT USE
// ============================================================================

/**
 * @deprecated Use ContainerExecutorTool instead - RCE risk
 */
export { PythonExecutorTool } from "./python-executor.tool";

/**
 * @deprecated Use ContainerExecutorTool instead - RCE risk
 */
export { JavaScriptExecutorTool } from "./javascript-executor.tool";

/**
 * @deprecated Use ContainerExecutorTool instead - RCE risk
 */
export { ShellExecutorTool } from "./shell-executor.tool";

// ============================================================================
// Types (for backward compatibility only)
// ============================================================================
export type {
  PythonExecutorInput,
  PythonExecutorOutput,
} from "./python-executor.tool";

export type {
  JavaScriptExecutorInput,
  JavaScriptExecutorOutput,
} from "./javascript-executor.tool";

export type {
  ShellExecutorInput,
  ShellExecutorOutput,
} from "./shell-executor.tool";
