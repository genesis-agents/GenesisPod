/**
 * Leader Agent - 任务编排器
 *
 * 24小时自动化运行的核心组件，负责：
 * - 管理任务队列
 * - 调度 Worker Agent
 * - 监控执行状态
 * - 处理失败和重试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawn, ChildProcess } from 'child_process';

// ============================================================================
// 类型定义
// ============================================================================

interface Task {
  id: string;
  type: 'monitoring' | 'merge' | 'docs' | 'code-review' | 'data-validation';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'running' | 'completed' | 'failed';
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
    created_at: string;
    last_update: string;
    leader_session_id: string | null;
    statistics: {
      total_processed: number;
      total_succeeded: number;
      total_failed: number;
      uptime_seconds: number;
    };
  };
  tasks: Task[];
  completed_tasks: Task[];
  failed_tasks: Task[];
}

interface LeaderState {
  leader_session_id: string | null;
  status: 'initialized' | 'running' | 'paused' | 'stopped' | 'error';
  started_at: string | null;
  last_heartbeat: string | null;
  current_cycle: number;
  running_tasks: string[];
  worker_status: Record<string, 'ready' | 'busy' | 'error'>;
  statistics: {
    cycles_completed: number;
    tasks_started: number;
    tasks_completed: number;
    tasks_failed: number;
    total_runtime_seconds: number;
  };
  last_error: string | null;
}

interface Config {
  leader: {
    schedule_interval: number;
    max_concurrent_tasks: number;
    task_timeout: number;
    auto_retry: boolean;
    max_retries: number;
    retry_delay: number;
    backoff_multiplier: number;
    log_level: string;
  };
  workers: Record<
    string,
    {
      enabled: boolean;
      model: string;
      max_concurrent: number;
      timeout: number;
      description: string;
    }
  >;
  task_worker_mapping: Record<string, string>;
  priority_weights: Record<string, number>;
}

// ============================================================================
// 常量
// ============================================================================

// 使用 process.cwd() 因为始终从项目根目录运行
const BASE_DIR = path.join(process.cwd(), '.claude/orchestrator');
const LOGS_DIR = path.join(process.cwd(), '.claude/logs');
const CONFIG_PATH = path.join(BASE_DIR, 'config.yml');
const TASK_QUEUE_PATH = path.join(BASE_DIR, 'task-queue.json');
const LEADER_STATE_PATH = path.join(BASE_DIR, 'leader-state.json');
const AUDIT_LOG_PATH = path.join(LOGS_DIR, 'orchestrator-audit.jsonl');

// ============================================================================
// 工具函数
// ============================================================================

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const emoji = {
    debug: '🔍',
    info: '📋',
    warn: '⚠️',
    error: '❌',
  }[level];

  console.log(`[${timestamp}] ${emoji} [${level.toUpperCase()}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Leader Agent 类
// ============================================================================

class LeaderAgent {
  private config: Config;
  private taskQueue: TaskQueue;
  private state: LeaderState;
  private isRunning: boolean = false;
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private startTime: number = 0;

  constructor() {
    this.config = this.loadConfig();
    this.taskQueue = this.loadTaskQueue();
    this.state = this.loadState();
  }

  // --------------------------------------------------------------------------
  // 配置和状态管理
  // --------------------------------------------------------------------------

  private loadConfig(): Config {
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return yaml.load(content) as Config;
    } catch (error) {
      log('error', 'Failed to load config', error);
      throw error;
    }
  }

  private loadTaskQueue(): TaskQueue {
    try {
      const content = fs.readFileSync(TASK_QUEUE_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      log('warn', 'Task queue not found, creating new one');
      return {
        metadata: {
          version: '1.0.0',
          created_at: new Date().toISOString(),
          last_update: new Date().toISOString(),
          leader_session_id: null,
          statistics: {
            total_processed: 0,
            total_succeeded: 0,
            total_failed: 0,
            uptime_seconds: 0,
          },
        },
        tasks: [],
        completed_tasks: [],
        failed_tasks: [],
      };
    }
  }

  private saveTaskQueue(): void {
    this.taskQueue.metadata.last_update = new Date().toISOString();
    fs.writeFileSync(TASK_QUEUE_PATH, JSON.stringify(this.taskQueue, null, 2));
  }

  private loadState(): LeaderState {
    try {
      const content = fs.readFileSync(LEADER_STATE_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      log('warn', 'Leader state not found, creating new one');
      return {
        leader_session_id: null,
        status: 'initialized',
        started_at: null,
        last_heartbeat: null,
        current_cycle: 0,
        running_tasks: [],
        worker_status: {
          monitoring: 'ready',
          'merge-to-main': 'ready',
          'docs-specialist': 'ready',
        },
        statistics: {
          cycles_completed: 0,
          tasks_started: 0,
          tasks_completed: 0,
          tasks_failed: 0,
          total_runtime_seconds: 0,
        },
        last_error: null,
      };
    }
  }

  private saveState(): void {
    this.state.last_heartbeat = new Date().toISOString();
    this.state.statistics.total_runtime_seconds = Math.floor((Date.now() - this.startTime) / 1000);
    fs.writeFileSync(LEADER_STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  // --------------------------------------------------------------------------
  // 审计日志
  // --------------------------------------------------------------------------

  private audit(event: string, data: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...data,
    };

    try {
      fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (error) {
      log('error', 'Failed to write audit log', error);
    }
  }

  // --------------------------------------------------------------------------
  // 任务管理
  // --------------------------------------------------------------------------

  private getPendingTasks(): Task[] {
    return this.taskQueue.tasks
      .filter((task) => task.status === 'pending')
      .filter((task) => this.areDependenciesMet(task))
      .sort((a, b) => {
        const weightA = this.config.priority_weights[a.priority] || 0;
        const weightB = this.config.priority_weights[b.priority] || 0;
        return weightB - weightA;
      });
  }

  private getRunningTasks(): Task[] {
    return this.taskQueue.tasks.filter((task) => task.status === 'running');
  }

  private areDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every((depId) => {
      const completed = this.taskQueue.completed_tasks.find((t) => t.id === depId);
      return completed !== undefined;
    });
  }

  private getWorkerForTask(task: Task): string | null {
    const workerName = this.config.task_worker_mapping[task.type];
    if (!workerName) {
      log('warn', `No worker mapping for task type: ${task.type}`);
      return null;
    }

    const worker = this.config.workers[workerName];
    if (!worker || !worker.enabled) {
      log('warn', `Worker not enabled: ${workerName}`);
      return null;
    }

    const workerStatus = this.state.worker_status[workerName];
    if (workerStatus === 'busy') {
      log('debug', `Worker busy: ${workerName}`);
      return null;
    }

    return workerName;
  }

  // --------------------------------------------------------------------------
  // 任务执行
  // --------------------------------------------------------------------------

  private async executeTask(task: Task, workerName: string): Promise<void> {
    log('info', `Starting task: ${task.id} (${task.type})`, { title: task.title });

    // 更新状态
    task.status = 'running';
    task.started_at = new Date().toISOString();
    task.assigned_to = workerName;
    this.state.worker_status[workerName] = 'busy';
    this.state.running_tasks.push(task.id);
    this.state.statistics.tasks_started++;
    this.saveTaskQueue();
    this.saveState();

    this.audit('task_started', {
      task_id: task.id,
      type: task.type,
      worker: workerName,
      priority: task.priority,
    });

    try {
      // 构建 Claude Code 命令
      const prompt = this.buildTaskPrompt(task);
      const result = await this.runClaudeAgent(workerName, prompt, task.timeout);

      // 任务完成
      task.status = 'completed';
      task.completed_at = new Date().toISOString();
      task.result = result;

      // 移动到完成队列
      this.taskQueue.tasks = this.taskQueue.tasks.filter((t) => t.id !== task.id);
      this.taskQueue.completed_tasks.push(task);
      this.taskQueue.metadata.statistics.total_processed++;
      this.taskQueue.metadata.statistics.total_succeeded++;

      this.state.statistics.tasks_completed++;

      log('info', `Task completed: ${task.id}`, { duration: this.getTaskDuration(task) });
      this.audit('task_completed', {
        task_id: task.id,
        type: task.type,
        duration: this.getTaskDuration(task),
        result: 'success',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Task failed: ${task.id}`, { error: errorMessage });

      task.error = errorMessage;
      task.retry_count++;

      if (this.config.leader.auto_retry && task.retry_count < task.max_retries) {
        // 重试
        task.status = 'pending';
        task.started_at = null;
        task.assigned_to = null;
        log('warn', `Task will retry: ${task.id} (attempt ${task.retry_count}/${task.max_retries})`);

        this.audit('task_retry', {
          task_id: task.id,
          retry_count: task.retry_count,
          error: errorMessage,
        });
      } else {
        // 标记失败
        task.status = 'failed';
        task.completed_at = new Date().toISOString();

        this.taskQueue.tasks = this.taskQueue.tasks.filter((t) => t.id !== task.id);
        this.taskQueue.failed_tasks.push(task);
        this.taskQueue.metadata.statistics.total_processed++;
        this.taskQueue.metadata.statistics.total_failed++;

        this.state.statistics.tasks_failed++;

        this.audit('task_failed', {
          task_id: task.id,
          type: task.type,
          error: errorMessage,
          retries: task.retry_count,
        });
      }
    } finally {
      // 清理状态
      this.state.worker_status[workerName] = 'ready';
      this.state.running_tasks = this.state.running_tasks.filter((id) => id !== task.id);
      this.saveTaskQueue();
      this.saveState();
    }
  }

  private buildTaskPrompt(task: Task): string {
    const basePrompt = `
## 任务信息
- ID: ${task.id}
- 类型: ${task.type}
- 优先级: ${task.priority}
- 标题: ${task.title}

## 任务描述
${task.description}

## 参数
${JSON.stringify(task.parameters, null, 2)}

## 执行要求
1. 完成任务后，输出清晰的执行结果
2. 如果遇到问题，详细描述错误信息
3. 提供可操作的建议

请开始执行任务。
`;

    return basePrompt;
  }

  private async runClaudeAgent(
    workerName: string,
    prompt: string,
    timeout: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = this.config.workers[workerName];
      const model = worker?.model || 'sonnet';

      // 使用 Claude Code CLI
      const args = [
        '-p',
        prompt,
        '--output-format',
        'text',
        '--permission-mode',
        'acceptEdits',
        '--model',
        `claude-${model}-4-20250514`,
      ];

      log('debug', `Spawning claude process for ${workerName}`);

      const childProcess = spawn('claude', args, {
        cwd: globalThis.process.cwd(),
        env: { ...globalThis.process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.runningProcesses.set(workerName, childProcess);

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error(`Task timeout after ${timeout}s`));
      }, timeout * 1000);

      childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(workerName);

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(workerName);
        reject(error);
      });
    });
  }

  private getTaskDuration(task: Task): string {
    if (!task.started_at || !task.completed_at) {
      return 'N/A';
    }

    const start = new Date(task.started_at).getTime();
    const end = new Date(task.completed_at).getTime();
    const durationMs = end - start;

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // --------------------------------------------------------------------------
  // 调度循环
  // --------------------------------------------------------------------------

  private async scheduleCycle(): Promise<void> {
    this.state.current_cycle++;
    log('info', `Starting schedule cycle #${this.state.current_cycle}`);

    const pendingTasks = this.getPendingTasks();
    const runningTasks = this.getRunningTasks();

    log('info', `Tasks: ${pendingTasks.length} pending, ${runningTasks.length} running`);

    // 检查是否可以启动新任务
    const availableSlots = this.config.leader.max_concurrent_tasks - runningTasks.length;

    if (availableSlots <= 0) {
      log('debug', 'No available slots for new tasks');
      return;
    }

    // 分配任务
    for (let i = 0; i < Math.min(availableSlots, pendingTasks.length); i++) {
      const task = pendingTasks[i];
      const workerName = this.getWorkerForTask(task);

      if (workerName) {
        // 异步执行任务（不等待完成）
        this.executeTask(task, workerName).catch((error) => {
          log('error', `Task execution error: ${task.id}`, error);
        });
      }
    }

    this.state.statistics.cycles_completed++;
    this.saveState();
  }

  // --------------------------------------------------------------------------
  // 主运行循环
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) {
      log('warn', 'Leader Agent is already running');
      return;
    }

    log('info', '🚀 Leader Agent starting...');

    this.isRunning = true;
    this.startTime = Date.now();
    this.state.status = 'running';
    this.state.started_at = new Date().toISOString();
    this.state.leader_session_id = generateTaskId();
    this.taskQueue.metadata.leader_session_id = this.state.leader_session_id;

    this.saveState();
    this.saveTaskQueue();

    this.audit('leader_started', {
      session_id: this.state.leader_session_id,
      config: {
        schedule_interval: this.config.leader.schedule_interval,
        max_concurrent_tasks: this.config.leader.max_concurrent_tasks,
      },
    });

    // 主循环
    while (this.isRunning) {
      try {
        await this.scheduleCycle();
      } catch (error) {
        log('error', 'Schedule cycle error', error);
        this.state.last_error = error instanceof Error ? error.message : String(error);
        this.saveState();
      }

      // 等待下一个调度周期
      await sleep(this.config.leader.schedule_interval * 1000);
    }
  }

  async stop(): Promise<void> {
    log('info', '🛑 Leader Agent stopping...');

    this.isRunning = false;
    this.state.status = 'stopped';

    // 终止所有运行中的进程
    for (const [name, process] of this.runningProcesses) {
      log('warn', `Terminating worker: ${name}`);
      process.kill('SIGTERM');
    }

    this.saveState();

    this.audit('leader_stopped', {
      session_id: this.state.leader_session_id,
      statistics: this.state.statistics,
    });

    log('info', '✅ Leader Agent stopped');
  }

  // --------------------------------------------------------------------------
  // 公共 API
  // --------------------------------------------------------------------------

  addTask(
    type: Task['type'],
    priority: Task['priority'],
    title: string,
    description: string,
    parameters: Record<string, unknown> = {},
    options: Partial<Task> = {}
  ): Task {
    const task: Task = {
      id: generateTaskId(),
      type,
      priority,
      status: 'pending',
      title,
      description,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      assigned_to: null,
      result: null,
      error: null,
      retry_count: 0,
      max_retries: options.max_retries || this.config.leader.max_retries,
      timeout: options.timeout || this.config.leader.task_timeout,
      parameters,
      dependencies: options.dependencies || [],
      tags: options.tags || [],
    };

    this.taskQueue.tasks.push(task);
    this.saveTaskQueue();

    this.audit('task_added', {
      task_id: task.id,
      type: task.type,
      priority: task.priority,
    });

    log('info', `Task added: ${task.id}`, { title: task.title });

    return task;
  }

  getStatus(): {
    status: LeaderState['status'];
    uptime: string;
    statistics: LeaderState['statistics'];
    tasks: { pending: number; running: number; completed: number; failed: number };
    workers: LeaderState['worker_status'];
  } {
    const uptimeSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    return {
      status: this.state.status,
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      statistics: this.state.statistics,
      tasks: {
        pending: this.taskQueue.tasks.filter((t) => t.status === 'pending').length,
        running: this.taskQueue.tasks.filter((t) => t.status === 'running').length,
        completed: this.taskQueue.completed_tasks.length,
        failed: this.taskQueue.failed_tasks.length,
      },
      workers: this.state.worker_status,
    };
  }
}

// ============================================================================
// 主入口
// ============================================================================

async function main(): Promise<void> {
  const leader = new LeaderAgent();

  // 处理退出信号
  const handleExit = async (signal: string) => {
    log('info', `Received ${signal}, shutting down...`);
    await leader.stop();
    globalThis.process.exit(0);
  };

  globalThis.process.on('SIGINT', () => handleExit('SIGINT'));
  globalThis.process.on('SIGTERM', () => handleExit('SIGTERM'));

  // 启动
  await leader.start();
}

// 直接运行
main().catch((error) => {
  console.error('Fatal error:', error);
  globalThis.process.exit(1);
});

export { LeaderAgent };
export type { Task, TaskQueue, LeaderState };
