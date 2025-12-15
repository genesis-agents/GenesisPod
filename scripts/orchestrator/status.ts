#!/usr/bin/env npx ts-node
/**
 * 查看 Leader Agent 状态
 *
 * 用法:
 *   npx ts-node scripts/orchestrator/status.ts
 *   npx ts-node scripts/orchestrator/status.ts --json
 */

import * as fs from 'fs';
import * as path from 'path';

interface LeaderState {
  leader_session_id: string | null;
  status: string;
  started_at: string | null;
  last_heartbeat: string | null;
  current_cycle: number;
  running_tasks: string[];
  worker_status: Record<string, string>;
  statistics: {
    cycles_completed: number;
    tasks_started: number;
    tasks_completed: number;
    tasks_failed: number;
    total_runtime_seconds: number;
  };
  last_error: string | null;
}

interface TaskQueue {
  metadata: {
    last_update: string;
    statistics: {
      total_processed: number;
      total_succeeded: number;
      total_failed: number;
    };
  };
  tasks: Array<{ status: string; priority: string; type: string; title: string }>;
  completed_tasks: unknown[];
  failed_tasks: unknown[];
}

const LEADER_STATE_PATH = path.resolve(__dirname, '../../.claude/orchestrator/leader-state.json');
const TASK_QUEUE_PATH = path.resolve(__dirname, '../../.claude/orchestrator/task-queue.json');

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    running: '🟢',
    ready: '🟢',
    stopped: '🔴',
    error: '🔴',
    busy: '🟡',
    initialized: '🟡',
    paused: '🟠',
  };
  return emojis[status] || '⚪';
}

function main(): void {
  const isJson = process.argv.includes('--json');

  // 读取状态文件
  let state: LeaderState;
  let taskQueue: TaskQueue;

  try {
    state = JSON.parse(fs.readFileSync(LEADER_STATE_PATH, 'utf-8'));
  } catch {
    console.error('无法读取 Leader 状态文件');
    process.exit(1);
  }

  try {
    taskQueue = JSON.parse(fs.readFileSync(TASK_QUEUE_PATH, 'utf-8'));
  } catch {
    console.error('无法读取任务队列文件');
    process.exit(1);
  }

  const pendingTasks = taskQueue.tasks.filter((t) => t.status === 'pending');
  const runningTasks = taskQueue.tasks.filter((t) => t.status === 'running');

  if (isJson) {
    const output = {
      status: state.status,
      uptime: formatUptime(state.statistics.total_runtime_seconds),
      statistics: state.statistics,
      tasks: {
        pending: pendingTasks.length,
        running: runningTasks.length,
        completed: taskQueue.completed_tasks.length,
        failed: taskQueue.failed_tasks.length,
      },
      workers: state.worker_status,
      last_heartbeat: state.last_heartbeat,
      last_error: state.last_error,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // 格式化输出
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Leader Agent Status Dashboard                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // 基本状态
  console.log(`${getStatusEmoji(state.status)} Status: ${state.status.toUpperCase()}`);
  console.log(`⏱️  Uptime: ${formatUptime(state.statistics.total_runtime_seconds)}`);
  console.log(`🔄 Cycles: ${state.statistics.cycles_completed}`);
  if (state.last_heartbeat) {
    console.log(`💓 Last Heartbeat: ${state.last_heartbeat}`);
  }
  console.log('');

  // 任务统计
  console.log('📊 Task Statistics');
  console.log('─────────────────────────────────────');
  console.log(`   Pending:   ${pendingTasks.length}`);
  console.log(`   Running:   ${runningTasks.length}`);
  console.log(`   Completed: ${taskQueue.completed_tasks.length}`);
  console.log(`   Failed:    ${taskQueue.failed_tasks.length}`);
  console.log(`   Total:     ${state.statistics.tasks_started}`);
  console.log('');

  // Worker 状态
  console.log('🤖 Worker Status');
  console.log('─────────────────────────────────────');
  for (const [worker, status] of Object.entries(state.worker_status)) {
    console.log(`   ${getStatusEmoji(status)} ${worker}: ${status}`);
  }
  console.log('');

  // 待处理任务
  if (pendingTasks.length > 0) {
    console.log('📋 Pending Tasks (Top 5)');
    console.log('─────────────────────────────────────');
    pendingTasks.slice(0, 5).forEach((task, i) => {
      const priorityEmoji: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      };
      console.log(`   ${i + 1}. ${priorityEmoji[task.priority] || '⚪'} [${task.type}] ${task.title}`);
    });
    console.log('');
  }

  // 运行中任务
  if (runningTasks.length > 0) {
    console.log('🏃 Running Tasks');
    console.log('─────────────────────────────────────');
    runningTasks.forEach((task, i) => {
      console.log(`   ${i + 1}. [${task.type}] ${task.title}`);
    });
    console.log('');
  }

  // 错误信息
  if (state.last_error) {
    console.log('❌ Last Error');
    console.log('─────────────────────────────────────');
    console.log(`   ${state.last_error}`);
    console.log('');
  }

  console.log('─────────────────────────────────────');
  console.log(`Last updated: ${taskQueue.metadata.last_update}`);
  console.log('');
}

main();
