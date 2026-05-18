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
// 全局别名让旧测试无修改可跑；新测试推荐直接用 vi）
declare global {
  // eslint-disable-next-line no-var
  var jest: typeof vi;
}
globalThis.jest = vi;
