#!/usr/bin/env npx ts-node
/**
 * DeepDive AI Team - 简化命令行
 *
 * 使用方式:
 *   dear <命令> <内容>
 *
 * 示例:
 *   dear bug "登录页面报500错误"
 *   dear feature "添加用户头像上传功能"
 *   dear test "运行全栈测试"
 *   dear status
 */

import * as fs from "fs";
import * as path from "path";

// 从项目根目录运行
const TASK_QUEUE_PATH = path.join(
  process.cwd(),
  ".claude/orchestrator/task-queue.json"
);

// 命令映射表
const COMMANDS: Record<
  string,
  {
    type: string;
    workflow?: string;
    priority: string;
    description: string;
  }
> = {
  // 缺陷修复
  bug: {
    type: "bugfix",
    workflow: "defect_fix",
    priority: "high",
    description: "Bug修复",
  },
  fix: {
    type: "bugfix",
    workflow: "defect_fix",
    priority: "high",
    description: "Bug修复",
  },
  hotfix: {
    type: "bugfix",
    workflow: "defect_fix",
    priority: "critical",
    description: "紧急修复",
  },
  security: {
    type: "bugfix",
    workflow: "security_defect_fix",
    priority: "critical",
    description: "安全漏洞修复",
  },

  // 功能开发
  feature: {
    type: "requirement",
    workflow: "feature_development",
    priority: "medium",
    description: "新功能开发",
  },
  feat: {
    type: "requirement",
    workflow: "feature_development",
    priority: "medium",
    description: "新功能开发",
  },
  add: {
    type: "coding",
    priority: "medium",
    description: "添加功能",
  },

  // 测试
  test: {
    type: "testing",
    priority: "medium",
    description: "执行测试",
  },
  harden: {
    type: "test_hardening",
    priority: "medium",
    description: "测试加固",
  },

  // 代码质量
  review: {
    type: "review",
    priority: "medium",
    description: "代码审查",
  },
  refactor: {
    type: "refactor",
    priority: "low",
    description: "代码重构",
  },

  // 文档
  doc: {
    type: "docs",
    workflow: "documentation",
    priority: "low",
    description: "文档更新",
  },
  docs: {
    type: "docs",
    workflow: "documentation",
    priority: "low",
    description: "文档更新",
  },

  // 架构
  arch: {
    type: "architecture",
    priority: "high",
    description: "架构设计",
  },
  design: {
    type: "architecture",
    priority: "high",
    description: "技术方案设计",
  },

  // 运维
  monitor: {
    type: "monitoring",
    priority: "medium",
    description: "系统监控",
  },
  health: {
    type: "monitoring",
    priority: "medium",
    description: "健康检查",
  },
  deploy: {
    type: "merge",
    priority: "high",
    description: "部署发布",
  },
};

// 优先级修饰符
const PRIORITY_MODIFIERS: Record<string, string> = {
  "!": "critical", // bug! "紧急问题"
  "!!": "critical",
  urgent: "critical",
  asap: "critical",
  high: "high",
  low: "low",
};

function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `task-${timestamp}-${random}`;
}

function parseCommand(args: string[]): {
  command: string;
  content: string;
  priority?: string;
} {
  if (args.length === 0) {
    return { command: "help", content: "" };
  }

  let command = args[0].toLowerCase();
  let content = args.slice(1).join(" ");
  let priority: string | undefined;

  // 检查优先级修饰符 (如 bug! 或 feature:urgent)
  if (command.endsWith("!")) {
    priority = "critical";
    command = command.slice(0, -1);
  } else if (command.endsWith("!!")) {
    priority = "critical";
    command = command.slice(0, -2);
  }

  // 检查内容中的优先级标记
  for (const [modifier, prio] of Object.entries(PRIORITY_MODIFIERS)) {
    if (content.toLowerCase().includes(`[${modifier}]`)) {
      priority = prio;
      content = content.replace(new RegExp(`\\[${modifier}\\]`, "gi"), "").trim();
    }
  }

  return { command, content, priority };
}

function loadTaskQueue(): any {
  try {
    const data = fs.readFileSync(TASK_QUEUE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      metadata: {
        version: "2.0.0",
        created_at: new Date().toISOString(),
        last_update: new Date().toISOString(),
      },
      tasks: [],
      completed_tasks: [],
      failed_tasks: [],
      workflows: [],
    };
  }
}

function saveTaskQueue(queue: any): void {
  queue.metadata.last_update = new Date().toISOString();
  fs.writeFileSync(TASK_QUEUE_PATH, JSON.stringify(queue, null, 2));
}

function addTask(
  command: string,
  content: string,
  priorityOverride?: string
): void {
  const config = COMMANDS[command];
  if (!config) {
    console.log(`❌ 未知命令: ${command}`);
    showHelp();
    return;
  }

  const queue = loadTaskQueue();
  const taskId = generateTaskId();
  const priority = priorityOverride || config.priority;

  const task = {
    id: taskId,
    type: config.type,
    priority,
    status: "pending",
    title: content,
    description: content,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    assigned_to: null,
    result: null,
    error: null,
    retry_count: 0,
    max_retries: 3,
    timeout: 1800,
    workflow: config.workflow || null,
    dependencies: [],
    tags: [command],
  };

  queue.tasks.push(task);
  saveTaskQueue(queue);

  const priorityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  console.log(`\n✅ 任务已添加\n`);
  console.log(`   ID:       ${taskId}`);
  console.log(`   类型:     ${config.description} (${config.type})`);
  console.log(`   优先级:   ${priorityEmoji[priority]} ${priority}`);
  console.log(`   内容:     ${content}`);
  if (config.workflow) {
    console.log(`   工作流:   ${config.workflow}`);
  }
  console.log();
}

function showStatus(): void {
  const queue = loadTaskQueue();

  console.log("\n📊 任务队列状态\n");
  console.log("─".repeat(60));

  const pending = queue.tasks.filter((t: any) => t.status === "pending");
  const inProgress = queue.tasks.filter((t: any) => t.status === "in_progress");
  const completed = queue.completed_tasks || [];
  const failed = queue.failed_tasks || [];

  console.log(`待处理:   ${pending.length}`);
  console.log(`进行中:   ${inProgress.length}`);
  console.log(`已完成:   ${completed.length}`);
  console.log(`失败:     ${failed.length}`);
  console.log("─".repeat(60));

  if (inProgress.length > 0) {
    console.log("\n🔄 进行中的任务:");
    inProgress.forEach((t: any) => {
      console.log(`   • [${t.type}] ${t.title}`);
    });
  }

  if (pending.length > 0) {
    console.log("\n📋 待处理任务 (前5个):");
    pending.slice(0, 5).forEach((t: any) => {
      const emoji: Record<string, string> = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
      };
      console.log(`   ${emoji[t.priority] || "⚪"} [${t.type}] ${t.title}`);
    });
    if (pending.length > 5) {
      console.log(`   ... 还有 ${pending.length - 5} 个任务`);
    }
  }

  console.log();
}

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║               🤖 Dear AI Team - 任务命令                         ║
╚══════════════════════════════════════════════════════════════════╝

使用: dear <命令> "任务描述"

┌──────────────────────────────────────────────────────────────────┐
│ 🐛 缺陷修复                                                      │
├──────────────────────────────────────────────────────────────────┤
│  bug      "描述"    普通Bug (🟠 high)                            │
│  hotfix   "描述"    紧急修复 (🔴 critical)                       │
│  security "描述"    安全漏洞 (🔴 critical)                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ ✨ 功能开发                                                      │
├──────────────────────────────────────────────────────────────────┤
│  feature  "描述"    新功能 (完整开发流程)                        │
│  add      "描述"    简单功能                                     │
│  arch     "描述"    架构设计                                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 🧪 测试 & 质量                                                   │
├──────────────────────────────────────────────────────────────────┤
│  test     "描述"    执行测试                                     │
│  harden   "描述"    测试加固 (补充回归测试)                      │
│  review   "描述"    代码审查                                     │
│  refactor "描述"    代码重构                                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 📚 文档 & 运维                                                   │
├──────────────────────────────────────────────────────────────────┤
│  doc      "描述"    文档更新                                     │
│  monitor  "描述"    系统监控                                     │
│  deploy   "描述"    部署发布                                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 📊 查看状态                                                      │
├──────────────────────────────────────────────────────────────────┤
│  status             查看任务队列                                 │
│  help               显示此帮助                                   │
└──────────────────────────────────────────────────────────────────┘

💡 提示:
   • 加 ! 提升优先级:  dear bug! "紧急问题"
   • 查看状态:         dear status

📝 示例:
   dear bug "登录页面报500错误"
   dear feature "添加用户头像上传"
   dear security "修复XSS漏洞"
`);
}

// 主函数
function main(): void {
  const args = process.argv.slice(2);
  const { command, content, priority } = parseCommand(args);

  switch (command) {
    case "help":
    case "-h":
    case "--help":
      showHelp();
      break;
    case "status":
    case "s":
    case "ls":
      showStatus();
      break;
    default:
      if (!content) {
        console.log(`❌ 请提供任务内容`);
        console.log(`   示例: dear ${command} "任务描述"`);
        return;
      }
      addTask(command, content, priority);
  }
}

main();
