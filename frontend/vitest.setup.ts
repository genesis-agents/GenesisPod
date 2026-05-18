import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// jest → vi alias（项目 100+ 历史测试用 jest.fn / jest.mock API，未迁移到
// vitest 命名，导致 vitest run 跑这些测试时 ReferenceError: jest is not defined。
// 全局别名让旧测试无修改可跑；新测试推荐直接用 vi。
// 用 any cast 避开 TS 类型守护 —— vi 表面 API 跟 jest 兼容到测试可用，但底层
// types 不同（VitestUtils 缺少 jest 的 internal API 如 autoMockOff），不能
// 走 `as typeof jest` 真类型映射，否则 tsc 报缺接口
(globalThis as unknown as { jest: typeof vi }).jest = vi;
