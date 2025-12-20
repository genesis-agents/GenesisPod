/**
 * 代码执行 API
 */

import { apiClient } from '@/lib/api/client';

export interface ExecuteCodeInput {
  code: string;
  language: 'javascript' | 'typescript' | 'python';
  variables?: Record<string, unknown>;
  timeout?: number;
}

export interface ExecuteCodeResult {
  success: boolean;
  result?: unknown;
  logs?: Array<{
    type: 'log' | 'info' | 'warn' | 'error';
    message: string;
  }>;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime: number;
  figures?: Array<{
    type: string;
    format: string;
    data: string; // Base64 encoded image
  }>;
}

/**
 * 执行代码
 */
export async function executeCode(
  input: ExecuteCodeInput
): Promise<ExecuteCodeResult> {
  const response = await apiClient.post<ExecuteCodeResult>(
    '/ai-office/code/execute',
    input
  );
  return response;
}

/**
 * 格式化执行结果为可显示的字符串
 */
export function formatExecutionResult(result: ExecuteCodeResult): string {
  const lines: string[] = [];

  // 显示 console 日志
  if (result.logs && result.logs.length > 0) {
    for (const log of result.logs) {
      const prefix =
        log.type === 'error' ? '❌' : log.type === 'warn' ? '⚠️' : '';
      lines.push(`${prefix} ${log.message}`);
    }
  }

  // 显示 stdout (Python)
  if (result.stdout) {
    lines.push(result.stdout);
  }

  // 显示返回值
  if (result.result !== undefined) {
    const resultStr =
      typeof result.result === 'object'
        ? JSON.stringify(result.result, null, 2)
        : String(result.result);
    if (resultStr && resultStr !== 'undefined') {
      lines.push(`=> ${resultStr}`);
    }
  }

  // 显示错误
  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  if (result.stderr && !result.error) {
    lines.push(`Error: ${result.stderr}`);
  }

  return lines.join('\n') || '(no output)';
}
