/**
 * Span exporter 接口（v5.1 R0.5 PR-7）
 *
 * 抽象 OTLP 上报，让 plugin 在测试时可注入 mock；生产环境注入真实 OTLP exporter。
 * 此接口故意小：只接受 plain JSON-safe span 数据，不依赖任何 OTel SDK 类型。
 */

export interface SpanData {
  /** span name，如 "llm.request" / "tool.execute" / "mission.run" */
  readonly name: string;
  /** 业务无关 attributes（不含 PII；attributes 已经过 PII scrubber 过滤）*/
  readonly attributes: Record<string, string | number | boolean>;
  /** 起止时间戳（毫秒）*/
  readonly startTime: number;
  readonly endTime: number;
  /** 状态：ok / error / aborted */
  readonly status: "ok" | "error" | "aborted";
  /** 业务无关错误标签（不含敏感字段 stack trace） */
  readonly errorMessage?: string;
}

export interface ISpanExporter {
  /** 导出一条 span（fire-and-forget；exporter 自己处理批量 / 重试 / OTLP 协议）*/
  export(span: SpanData): void | Promise<void>;
  /** flush 缓存（可选，进程退出 / dispose 时调用）*/
  flush?(): Promise<void>;
}

/**
 * 测试 / 开发用：内存 exporter，spec 用它断言 plugin 写入正确 span
 */
export class InMemorySpanExporter implements ISpanExporter {
  private readonly spans: SpanData[] = [];

  export(span: SpanData): void {
    this.spans.push(span);
  }

  /** 测试用：拿到累计 span 列表 */
  getSpans(): ReadonlyArray<SpanData> {
    return this.spans.slice();
  }

  /** 测试用：清空 */
  clear(): void {
    this.spans.length = 0;
  }
}
