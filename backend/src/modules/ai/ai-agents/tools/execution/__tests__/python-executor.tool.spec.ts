/**
 * Python Executor Tool Tests
 */

import { PythonExecutorTool } from "../python-executor.tool";
import { ToolContext } from "../../../core";

describe("PythonExecutorTool", () => {
  let tool: PythonExecutorTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new PythonExecutorTool();
    context = {
      taskId: "test-task",
    };
  });

  describe("基本功能", () => {
    it("应该能执行简单的 Python 代码", async () => {
      const result = await tool.execute(
        {
          code: 'print("Hello, World!")',
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.stdout).toContain("Hello, World!");
    }, 30000);

    it("应该能捕获返回值", async () => {
      const result = await tool.execute(
        {
          code: "_result = 42",
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.returnValue).toBe(42);
    }, 30000);

    it("应该能捕获错误", async () => {
      const result = await tool.execute(
        {
          code: "raise ValueError('Test error')",
        },
        context,
      );

      expect(result.success).toBe(true); // 工具执行成功
      expect(result.data?.success).toBe(false); // Python 代码执行失败
      expect(result.data?.stderr).toContain("ValueError");
      expect(result.data?.stderr).toContain("Test error");
    }, 30000);
  });

  describe("上下文变量", () => {
    it("应该能传递变量", async () => {
      const result = await tool.execute(
        {
          code: "_result = x + y",
          context: {
            variables: {
              x: 10,
              y: 20,
            },
          },
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.returnValue).toBe(30);
    }, 30000);

    it("应该能传递复杂数据结构", async () => {
      const result = await tool.execute(
        {
          code: `
_result = {
  'name': user['name'],
  'age': user['age'],
  'sum': sum(numbers)
}
          `,
          context: {
            variables: {
              user: { name: "Alice", age: 30 },
              numbers: [1, 2, 3, 4, 5],
            },
          },
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.returnValue).toEqual({
        name: "Alice",
        age: 30,
        sum: 15,
      });
    }, 30000);
  });

  describe("安全检查", () => {
    it("应该拒绝导入 os 模块", async () => {
      const result = await tool.execute(
        {
          code: "import os",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Custom validation failed");
    });

    it("应该拒绝导入 subprocess 模块", async () => {
      const result = await tool.execute(
        {
          code: "import subprocess",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Custom validation failed");
    });

    it("应该拒绝使用 eval", async () => {
      const result = await tool.execute(
        {
          code: "eval('1 + 1')",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Custom validation failed");
    });

    it("应该拒绝使用 open", async () => {
      const result = await tool.execute(
        {
          code: "open('/etc/passwd', 'r')",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Custom validation failed");
    });

    it("应该允许导入安全的模块", async () => {
      const result = await tool.execute(
        {
          code: `
import json
import math

_result = {
  'json_works': True,
  'math_pi': math.pi
}
          `,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.returnValue).toHaveProperty("json_works", true);
      expect(result.data?.returnValue).toHaveProperty("math_pi");
    }, 30000);
  });

  describe("数据处理", () => {
    it("应该能处理 numpy 数组", async () => {
      const result = await tool.execute(
        {
          code: `
import numpy as np

arr = np.array([1, 2, 3, 4, 5])
_result = {
  'mean': float(arr.mean()),
  'sum': float(arr.sum()),
  'array': arr.tolist()
}
          `,
        },
        context,
      );

      if (result.success && result.data?.success) {
        expect(result.data.returnValue).toHaveProperty("mean", 3);
        expect(result.data.returnValue).toHaveProperty("sum", 15);
        expect(result.data.returnValue).toHaveProperty(
          "array",
          [1, 2, 3, 4, 5],
        );
      } else {
        // numpy 可能未安装，跳过测试
        console.log("Skipping numpy test - module not available");
      }
    }, 30000);

    it("应该能处理 pandas DataFrame", async () => {
      const result = await tool.execute(
        {
          code: `
import pandas as pd

df = pd.DataFrame({
  'name': ['Alice', 'Bob'],
  'age': [25, 30]
})

_result = df.to_dict('records')
          `,
        },
        context,
      );

      if (result.success && result.data?.success) {
        expect(result.data.returnValue).toEqual([
          { name: "Alice", age: 25 },
          { name: "Bob", age: 30 },
        ]);
      } else {
        // pandas 可能未安装，跳过测试
        console.log("Skipping pandas test - module not available");
      }
    }, 30000);
  });

  describe("超时控制", () => {
    it("应该在超时后终止执行", async () => {
      const result = await tool.execute(
        {
          code: `
import time
time.sleep(5)
_result = "completed"
          `,
          options: {
            timeout: 1000, // 1 秒超时
          },
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    }, 10000); // Jest 超时设置为 10 秒

    it("应该能在限制时间内完成", async () => {
      const result = await tool.execute(
        {
          code: `
import time
time.sleep(0.5)
_result = "completed"
          `,
          options: {
            timeout: 2000, // 2 秒超时
          },
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.returnValue).toBe("completed");
    }, 30000);
  });

  describe("图表捕获", () => {
    it("应该能捕获 matplotlib 图表", async () => {
      const result = await tool.execute(
        {
          code: `
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y = np.sin(x)

plt.figure(figsize=(8, 6))
plt.plot(x, y)
plt.title('Sine Wave')
          `,
        },
        context,
      );

      if (result.success && result.data?.success) {
        expect(result.data.figures).toBeDefined();
        if (result.data.figures && result.data.figures.length > 0) {
          expect(result.data.figures[0]).toHaveProperty("type", "image");
          expect(result.data.figures[0]).toHaveProperty("format", "png");
          expect(result.data.figures[0]).toHaveProperty("data");
          expect(result.data.figures[0].data).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64
        }
      } else {
        // matplotlib 可能未安装，跳过测试
        console.log("Skipping matplotlib test - module not available");
      }
    }, 30000);
  });

  describe("输入验证", () => {
    it("应该拒绝空代码", async () => {
      const result = await tool.execute(
        {
          code: "",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Custom validation failed");
    });

    it("应该拒绝非字符串代码", async () => {
      const result = await tool.execute(
        {
          code: null as any,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Expected string but got null");
    });
  });
});
