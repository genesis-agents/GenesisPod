#!/usr/bin/env npx ts-node
/**
 * 直接运行单个任务 (用于定时任务或手动触发)
 *
 * 用法:
 *   npx ts-node scripts/orchestrator/run-task.ts --type monitoring --title "健康检查"
 */

import { spawn } from 'child_process';
import * as path from 'path';

function parseArgs(): {
  type: string;
  priority: string;
  title: string;
  description: string;
} {
  const args = process.argv.slice(2);
  const result = {
    type: 'monitoring',
    priority: 'medium',
    title: '手动任务',
    description: '',
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
    }
  }

  return result;
}

function buildPrompt(args: { type: string; priority: string; title: string; description: string }): string {
  const workerPrompts: Record<string, string> = {
    monitoring: `
你是 Monitoring Agent，负责系统监控和健康检查。

任务: ${args.title}
${args.description ? `描述: ${args.description}` : ''}

请执行以下检查:
1. 检查前端和后端服务状态
2. 检查数据库连接
3. 分析最近的日志和错误
4. 生成健康状态报告

输出格式:
- 服务状态概览
- 发现的问题 (如有)
- 建议的操作 (如需要)
`,
    merge: `
你是 Merge Agent，负责代码合并和 CI/CD 监控。

任务: ${args.title}
${args.description ? `描述: ${args.description}` : ''}

请执行以下操作:
1. 检查待合并的分支
2. 验证代码质量
3. 监控 CI 状态
4. 报告合并结果
`,
    docs: `
你是 Docs Agent，负责文档维护和更新。

任务: ${args.title}
${args.description ? `描述: ${args.description}` : ''}

请执行以下操作:
1. 检查文档完整性
2. 识别过时的内容
3. 提出更新建议
4. 生成文档报告
`,
  };

  return workerPrompts[args.type] || workerPrompts.monitoring;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const prompt = buildPrompt(args);

  console.log(`🚀 执行任务: ${args.title}`);
  console.log(`   类型: ${args.type}`);
  console.log(`   优先级: ${args.priority}`);
  console.log('');

  const claudeArgs = ['-p', prompt, '--output-format', 'text', '--permission-mode', 'acceptEdits'];

  const proc = spawn('claude', claudeArgs, {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit',
  });

  proc.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ 任务完成');
    } else {
      console.log(`\n❌ 任务失败 (exit code: ${code})`);
    }
    process.exit(code || 0);
  });

  proc.on('error', (error) => {
    console.error('执行错误:', error);
    process.exit(1);
  });
}

main();
