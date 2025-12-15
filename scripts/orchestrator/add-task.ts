#!/usr/bin/env npx ts-node
/**
 * 添加任务到队列
 *
 * 用法:
 *   npx ts-node scripts/orchestrator/add-task.ts --type monitoring --priority high --title "检查系统"
 *   npx ts-node scripts/orchestrator/add-task.ts --type docs --priority low --title "更新文档" --description "更新 API 文档"
 */

import * as fs from 'fs';
import * as path from 'path';

interface Task {
  id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  result: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  timeout: number;
  parameters: Record<string, unknown>;
  dependencies: string[];
  tags: string[];
}

interface TaskQueue {
  metadata: {
    version: string;
    last_update: string;
    [key: string]: unknown;
  };
  tasks: Task[];
  completed_tasks: Task[];
  failed_tasks: Task[];
}

const TASK_QUEUE_PATH = path.resolve(__dirname, '../../.claude/orchestrator/task-queue.json');

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseArgs(): {
  type: string;
  priority: string;
  title: string;
  description: string;
  tags: string[];
} {
  const args = process.argv.slice(2);
  const result = {
    type: 'monitoring',
    priority: 'medium',
    title: '',
    description: '',
    tags: [] as string[],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
      case '-t':
        result.type = args[++i];
        break;
      case '--priority':
      case '-p':
        result.priority = args[++i];
        break;
      case '--title':
        result.title = args[++i];
        break;
      case '--description':
      case '-d':
        result.description = args[++i];
        break;
      case '--tags':
        result.tags = args[++i].split(',');
        break;
      case '--help':
      case '-h':
        console.log(`
添加任务到队列

用法:
  npx ts-node add-task.ts [options]

选项:
  --type, -t        任务类型 (monitoring, merge, docs, code-review, data-validation)
  --priority, -p    优先级 (critical, high, medium, low)
  --title           任务标题 (必需)
  --description, -d 任务描述
  --tags            标签 (逗号分隔)
  --help, -h        显示帮助

示例:
  npx ts-node add-task.ts --type monitoring --priority high --title "紧急健康检查"
  npx ts-node add-task.ts --type docs --title "更新API文档" --tags "api,docs"
        `);
        process.exit(0);
    }
  }

  if (!result.title) {
    console.error('错误: 必须提供 --title 参数');
    process.exit(1);
  }

  return result;
}

function main(): void {
  const args = parseArgs();

  // 读取任务队列
  let taskQueue: TaskQueue;
  try {
    const content = fs.readFileSync(TASK_QUEUE_PATH, 'utf-8');
    taskQueue = JSON.parse(content);
  } catch (error) {
    console.error('无法读取任务队列文件:', error);
    process.exit(1);
  }

  // 创建新任务
  const task: Task = {
    id: generateTaskId(),
    type: args.type,
    priority: args.priority,
    status: 'pending',
    title: args.title,
    description: args.description || args.title,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    assigned_to: null,
    result: null,
    error: null,
    retry_count: 0,
    max_retries: 3,
    timeout: 600,
    parameters: {},
    dependencies: [],
    tags: args.tags,
  };

  // 添加到队列
  taskQueue.tasks.push(task);
  taskQueue.metadata.last_update = new Date().toISOString();

  // 保存
  fs.writeFileSync(TASK_QUEUE_PATH, JSON.stringify(taskQueue, null, 2));

  console.log(`✅ 任务已添加: ${task.id}`);
  console.log(`   类型: ${task.type}`);
  console.log(`   优先级: ${task.priority}`);
  console.log(`   标题: ${task.title}`);
}

main();
