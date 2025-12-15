/**
 * 前端日志工具
 *
 * 在生产环境中自动禁用 console 输出
 * 在开发环境中正常输出以便调试
 */

const isDevelopment = process.env.NODE_ENV === "development";

type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const noop = () => {};

/**
 * 创建一个命名的 logger 实例
 * @param name Logger 名称，用于标识日志来源
 */
export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;

  return {
    debug: isDevelopment
      ? (...args: unknown[]) => console.debug(prefix, ...args)
      : noop,
    info: isDevelopment
      ? (...args: unknown[]) => console.info(prefix, ...args)
      : noop,
    log: isDevelopment
      ? (...args: unknown[]) => console.log(prefix, ...args)
      : noop,
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}

/**
 * 默认 logger 实例
 */
export const logger: Logger = {
  debug: isDevelopment ? console.debug.bind(console) : noop,
  info: isDevelopment ? console.info.bind(console) : noop,
  log: isDevelopment ? console.log.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;
