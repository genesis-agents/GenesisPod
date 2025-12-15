/**
 * PM2 Ecosystem Configuration
 *
 * 用于 24 小时运行 Leader Agent 的配置
 *
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only leader-agent
 *   pm2 logs leader-agent
 *   pm2 restart leader-agent
 *   pm2 stop leader-agent
 */

module.exports = {
  apps: [
    {
      name: 'leader-agent',
      script: './node_modules/ts-node/dist/bin.js',
      args: './scripts/orchestrator/leader-agent.ts',
      interpreter: 'node',
      interpreter_args: '',

      // 运行配置
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      // 自动重启配置
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 5000,

      // 内存限制 (超过则重启)
      max_memory_restart: '1G',

      // 定时重启 (每天凌晨 3 点)
      cron_restart: '0 3 * * *',

      // 环境变量
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },

      // 日志配置
      error_file: '.claude/logs/leader-agent-error.log',
      out_file: '.claude/logs/leader-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 信号处理
      kill_timeout: 10000,
      // wait_ready: true, // 暂时禁用，因为脚本没有发送 ready 信号
      // listen_timeout: 10000,
    },

    // 可选: 单独的监控 Agent
    {
      name: 'monitoring-cron',
      script: './scripts/orchestrator/run-task.ts',
      interpreter: 'npx',
      interpreter_args: 'ts-node',
      args: '--type monitoring --priority medium --title "定时健康检查"',

      // 每小时运行一次
      cron_restart: '0 * * * *',
      autorestart: false,

      env: {
        NODE_ENV: 'production',
      },

      error_file: '.claude/logs/monitoring-cron-error.log',
      out_file: '.claude/logs/monitoring-cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
