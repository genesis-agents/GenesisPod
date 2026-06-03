/**
 * Boot Smoke Test —— DI 图实例化冒烟测试
 *
 * 背景：CI 从不真正启动应用（单测大量 mock 模块），导致**循环导入引发的
 * NestJS DI 解析崩溃**（"Nest can't resolve dependencies" /
 * "metatype is not a constructor" / 注入到 undefined）能一路漏到生产环境
 * （2026-06-03 ContentFetchService 生产启动崩溃，hotfix #220）。
 *
 * 本脚本用 `NestFactory.create(AppModule)` 实例化**完整 provider 依赖图**——
 * 这正是 DI 循环崩溃触发的阶段——但**不调用 app.init()**，因此不会触发
 * onModuleInit 里的 Redis / 外部服务网络连接，保持轻量、确定、无需真实依赖。
 *
 * 退出码 0 = DI 图可完整解析；非 0 = 存在无法解析的依赖（疑似 facade barrel 循环）。
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../src/app.module";

async function main(): Promise<void> {
  const started = Date.now();
  // logger:false 静默框架日志；create() 会实例化所有 singleton provider（DI 解析在此发生），
  // 但不调用 onModuleInit（那是 app.init() 阶段），故不触发网络/DB 连接。
  // abortOnError:false —— 默认 NestFactory 的 ExceptionsZone 会在解析失败时直接
  // process.exit(1)（吞掉错误堆栈），改为让 create() reject，由下方 catch 打印完整堆栈。
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.close();
  // eslint-disable-next-line no-console
  console.log(
    `BOOT SMOKE TEST PASSED — full DI graph resolved in ${Date.now() - started}ms`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("BOOT SMOKE TEST FAILED — DI graph could not be resolved:");
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
