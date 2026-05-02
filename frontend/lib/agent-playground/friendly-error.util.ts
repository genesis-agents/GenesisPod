/**
 * 把后端 raw error code / stack 转成普通用户友好的简短中文。
 *
 * Strategy:
 *   1. 已知 error code → 中文短语 + 可选 hint
 *   2. 未匹配 → 去掉冗余技术细节后截前 80 字 + 省略号
 */

const ERROR_CODE_LABELS: Record<string, { label: string; hint?: string }> = {
  RUNNER_OUTPUT_SCHEMA_MISMATCH: {
    label: '输出格式不符合预期',
    hint: '已自动重试，无需人工介入',
  },
  RUNNER_INPUT_SCHEMA_MISMATCH: {
    label: '输入参数格式异常',
    hint: '检查任务配置或重新提交',
  },
  TOOL_TIMEOUT: { label: '工具调用超时', hint: '已自动降级或重试' },
  TOOL_RUNTIME_ERROR: { label: '工具执行失败', hint: '已记录错误日志' },
  TOOL_INPUT_VALIDATION_FAILED: { label: '工具参数校验未通过' },
  PROVIDER_API_ERROR: { label: 'AI 服务暂时不可用', hint: '稍后自动重试' },
  AGENT_BUDGET_EXHAUSTED: { label: '本任务预算耗尽' },
  AGENT_MAX_ITERATIONS: {
    label: '推理轮次达上限',
    hint: '已按当前最佳结果产出',
  },
  AGENT_ABORTED: { label: '任务被取消' },
};

export function friendlyError(raw: string | undefined | null): string {
  if (!raw) return '';
  const text = String(raw).trim();
  // 匹配 [CODE_NAME] 格式
  const codeMatch = text.match(/^\[([A-Z_]+)\]/);
  if (codeMatch) {
    const meta = ERROR_CODE_LABELS[codeMatch[1]];
    if (meta) {
      return meta.hint ? `${meta.label}（${meta.hint}）` : meta.label;
    }
  }
  // 兜底：去掉 schemaError / code= 等冗余技术细节后截短
  let cleaned = text
    .replace(/\[schemaError=[^\]]+\]/g, '')
    .replace(/\(code=[^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80) + '…';
  return cleaned;
}
