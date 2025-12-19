/**
 * MCP Transport Interface
 * MCP 传输层接口定义
 *
 * 遵循 MCP 规范，支持 stdio 和 HTTP/SSE 两种传输方式
 * 参考: https://modelcontextprotocol.io/specification
 */

import { MCPRequest, MCPResponse } from '../mcp-adapter';

// ============================================================================
// Types
// ============================================================================

/**
 * 传输状态
 */
export enum TransportState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  CLOSING = 'closing',
  ERROR = 'error',
}

/**
 * 传输事件类型
 */
export enum TransportEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  MESSAGE = 'message',
  ERROR = 'error',
  STATE_CHANGE = 'state_change',
}

/**
 * 传输事件
 */
export interface TransportEvent {
  type: TransportEventType;
  data?: unknown;
  error?: Error;
  timestamp: Date;
}

/**
 * 传输选项
 */
export interface TransportOptions {
  /** 读取超时 (毫秒) */
  readTimeout?: number;
  /** 写入超时 (毫秒) */
  writeTimeout?: number;
  /** 心跳间隔 (毫秒) */
  heartbeatInterval?: number;
  /** 是否自动重连 */
  autoReconnect?: boolean;
  /** 重连延迟 (毫秒) */
  reconnectDelay?: number;
  /** 最大重连次数 */
  maxReconnects?: number;
}

/**
 * 传输统计
 */
export interface TransportStats {
  /** 接收消息数 */
  messagesReceived: number;
  /** 发送消息数 */
  messagesSent: number;
  /** 接收字节数 */
  bytesReceived: number;
  /** 发送字节数 */
  bytesSent: number;
  /** 连接时间 */
  connectedAt?: Date;
  /** 最后活动时间 */
  lastActivityAt?: Date;
  /** 错误数 */
  errorCount: number;
}

/**
 * 消息处理器
 */
export type MessageHandler = (request: MCPRequest) => Promise<MCPResponse>;

/**
 * 事件监听器
 */
export type EventListener = (event: TransportEvent) => void;

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * MCP 传输接口
 * 所有传输实现必须实现此接口
 */
export interface IMCPTransport {
  /** 传输名称 */
  readonly name: string;

  /** 当前状态 */
  readonly state: TransportState;

  /** 统计信息 */
  readonly stats: TransportStats;

  /**
   * 启动传输
   * @param handler 消息处理器
   * @param options 传输选项
   */
  start(handler: MessageHandler, options?: TransportOptions): Promise<void>;

  /**
   * 停止传输
   */
  stop(): Promise<void>;

  /**
   * 发送消息
   * @param message 响应消息
   */
  send(message: MCPResponse): Promise<void>;

  /**
   * 添加事件监听器
   * @param type 事件类型
   * @param listener 监听器
   */
  on(type: TransportEventType, listener: EventListener): void;

  /**
   * 移除事件监听器
   * @param type 事件类型
   * @param listener 监听器
   */
  off(type: TransportEventType, listener: EventListener): void;
}

// ============================================================================
// Base Transport Class
// ============================================================================

/**
 * 传输基类
 * 提供通用功能实现
 */
export abstract class BaseTransport implements IMCPTransport {
  abstract readonly name: string;

  protected _state: TransportState = TransportState.DISCONNECTED;
  protected _stats: TransportStats = {
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    errorCount: 0,
  };

  protected handler?: MessageHandler;
  protected options: Required<TransportOptions>;
  protected listeners: Map<TransportEventType, Set<EventListener>> = new Map();

  constructor() {
    this.options = {
      readTimeout: 30000,
      writeTimeout: 10000,
      heartbeatInterval: 30000,
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnects: 5,
    };
  }

  get state(): TransportState {
    return this._state;
  }

  get stats(): TransportStats {
    return { ...this._stats };
  }

  abstract start(handler: MessageHandler, options?: TransportOptions): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(message: MCPResponse): Promise<void>;

  on(type: TransportEventType, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  off(type: TransportEventType, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  protected emit(event: TransportEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in transport event listener:', error);
        }
      }
    }
  }

  protected setState(state: TransportState): void {
    const previousState = this._state;
    this._state = state;
    this.emit({
      type: TransportEventType.STATE_CHANGE,
      data: { previousState, currentState: state },
      timestamp: new Date(),
    });
  }

  protected updateActivity(): void {
    this._stats.lastActivityAt = new Date();
  }
}
