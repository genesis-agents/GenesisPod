'use client';

import { useState, useMemo, useCallback } from 'react';

interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

interface BackendPreviewProps {
  files: ProjectFile[];
  className?: string;
}

// Detect project type from files
function detectProjectType(files: ProjectFile[]): {
  type: 'node' | 'nestjs' | 'express' | 'fastify' | 'unknown';
  packageJson?: Record<string, unknown>;
  startCommand: string;
  devCommand: string;
  buildCommand: string;
  description: string;
} {
  const packageJsonFile = files.find(
    (f) => f.path === 'package.json' || f.path.endsWith('/package.json')
  );

  let packageJson: Record<string, unknown> | undefined;
  if (packageJsonFile) {
    try {
      packageJson = JSON.parse(packageJsonFile.content);
    } catch {
      // Ignore parse errors
    }
  }

  const deps = {
    ...((packageJson?.dependencies as Record<string, string>) || {}),
    ...((packageJson?.devDependencies as Record<string, string>) || {}),
  };

  const scripts = (packageJson?.scripts as Record<string, string>) || {};

  // Detect NestJS
  if (deps['@nestjs/core'] || deps['@nestjs/common']) {
    return {
      type: 'nestjs',
      packageJson,
      startCommand: scripts.start || 'npm run start:prod',
      devCommand: scripts['start:dev'] || 'npm run start:dev',
      buildCommand: scripts.build || 'npm run build',
      description: 'NestJS 后端应用',
    };
  }

  // Detect Express
  if (deps['express']) {
    return {
      type: 'express',
      packageJson,
      startCommand: scripts.start || 'node src/index.js',
      devCommand: scripts.dev || 'npm run dev',
      buildCommand: scripts.build || 'npm run build',
      description: 'Express 后端应用',
    };
  }

  // Detect Fastify
  if (deps['fastify']) {
    return {
      type: 'fastify',
      packageJson,
      startCommand: scripts.start || 'npm start',
      devCommand: scripts.dev || 'npm run dev',
      buildCommand: scripts.build || 'npm run build',
      description: 'Fastify 后端应用',
    };
  }

  // Generic Node.js
  return {
    type: 'node',
    packageJson,
    startCommand: scripts.start || 'npm start',
    devCommand: scripts.dev || 'npm run dev',
    buildCommand: scripts.build || 'npm run build',
    description: 'Node.js 后端应用',
  };
}

// Simulated terminal output
function generateTerminalOutput(
  projectInfo: ReturnType<typeof detectProjectType>,
  command: 'install' | 'dev' | 'build' | 'start'
): string[] {
  const outputs: Record<string, string[]> = {
    install: [
      '$ npm install',
      '',
      'added 256 packages, and audited 257 packages in 8s',
      '',
      '45 packages are looking for funding',
      '  run `npm fund` for details',
      '',
      'found 0 vulnerabilities',
      '',
      '✓ 依赖安装完成',
    ],
    dev: [
      `$ ${projectInfo.devCommand}`,
      '',
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - 正在启动 Nest 应用...`
        : `正在启动开发服务器...`,
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - AppModule dependencies initialized`
        : `编译 TypeScript...`,
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - Mapped {/api, GET} route`
        : `监听文件变化...`,
      '',
      `🚀 开发服务器已启动`,
      `   Local:   http://localhost:3000`,
      `   Network: http://192.168.1.100:3000`,
      '',
      '按 Ctrl+C 停止服务器',
    ],
    build: [
      `$ ${projectInfo.buildCommand}`,
      '',
      '正在编译 TypeScript...',
      'src/main.ts → dist/main.js',
      'src/app.module.ts → dist/app.module.js',
      'src/app.controller.ts → dist/app.controller.js',
      'src/app.service.ts → dist/app.service.js',
      '',
      '✓ 编译完成',
      '  输出目录: ./dist',
      '  文件数量: 12',
      '  编译时间: 2.3s',
    ],
    start: [
      `$ ${projectInfo.startCommand}`,
      '',
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - Starting Nest application...`
        : `启动生产服务器...`,
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - AppModule dependencies initialized`
        : `加载配置...`,
      projectInfo.type === 'nestjs'
        ? `[Nest] 12345  - Nest application successfully started`
        : `服务器已启动`,
      '',
      `🚀 生产服务器运行中`,
      `   端口: 3000`,
      `   环境: production`,
      '',
      '服务器正在监听请求...',
    ],
  };

  return outputs[command];
}

export function BackendPreview({ files, className = '' }: BackendPreviewProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'install' | 'dev' | 'build' | 'start'
  >('overview');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const projectInfo = useMemo(() => detectProjectType(files), [files]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(label);
    setTimeout(() => setCopiedCommand(null), 2000);
  }, []);

  const terminalOutput = useMemo(() => {
    if (activeTab === 'overview') return [];
    return generateTerminalOutput(projectInfo, activeTab);
  }, [activeTab, projectInfo]);

  // Get key files to display
  const keyFiles = useMemo(() => {
    const important = [
      'package.json',
      'src/main.ts',
      'src/index.ts',
      'src/app.ts',
      'src/server.ts',
      'src/app.module.ts',
      'src/app.controller.ts',
      'tsconfig.json',
      '.env.example',
      'README.md',
    ];
    return files.filter((f) =>
      important.some((p) => f.path === p || f.path.endsWith('/' + p))
    );
  }, [files]);

  return (
    <div className={`flex h-full flex-col bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <span className="text-sm text-gray-300">
            {projectInfo.description}
          </span>
          <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
            {projectInfo.type.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700 bg-gray-800 px-2 py-1">
        {(['overview', 'install', 'dev', 'build', 'start'] as const).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab === 'overview' && '📋 概览'}
              {tab === 'install' && '📦 安装依赖'}
              {tab === 'dev' && '🔧 开发模式'}
              {tab === 'build' && '🏗️ 构建'}
              {tab === 'start' && '🚀 启动'}
            </button>
          )
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' ? (
          <div className="space-y-6">
            {/* Quick Start */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <span className="text-lg">🚀</span>
                快速开始
              </h3>
              <div className="space-y-3">
                {/* Install */}
                <div className="flex items-center justify-between rounded-lg bg-gray-900 p-3">
                  <div>
                    <div className="text-xs text-gray-400">1. 安装依赖</div>
                    <code className="text-sm text-green-400">npm install</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard('npm install', 'install')}
                    className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                  >
                    {copiedCommand === 'install' ? '✓ 已复制' : '复制'}
                  </button>
                </div>

                {/* Dev */}
                <div className="flex items-center justify-between rounded-lg bg-gray-900 p-3">
                  <div>
                    <div className="text-xs text-gray-400">2. 开发模式运行</div>
                    <code className="text-sm text-green-400">
                      {projectInfo.devCommand}
                    </code>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(projectInfo.devCommand, 'dev')
                    }
                    className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                  >
                    {copiedCommand === 'dev' ? '✓ 已复制' : '复制'}
                  </button>
                </div>

                {/* Build */}
                <div className="flex items-center justify-between rounded-lg bg-gray-900 p-3">
                  <div>
                    <div className="text-xs text-gray-400">3. 构建生产版本</div>
                    <code className="text-sm text-green-400">
                      {projectInfo.buildCommand}
                    </code>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(projectInfo.buildCommand, 'build')
                    }
                    className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                  >
                    {copiedCommand === 'build' ? '✓ 已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>

            {/* Project Structure */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <span className="text-lg">📁</span>
                关键文件
              </h3>
              <div className="space-y-1">
                {keyFiles.length > 0 ? (
                  keyFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-700"
                    >
                      <span className="text-xs">
                        {file.path.endsWith('.ts')
                          ? '🔷'
                          : file.path.endsWith('.json')
                            ? '📋'
                            : file.path.endsWith('.md')
                              ? '📝'
                              : '📄'}
                      </span>
                      <span>{file.path}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">暂无关键文件</p>
                )}
              </div>
            </div>

            {/* API Endpoints Preview (if available) */}
            {projectInfo.type === 'nestjs' && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <span className="text-lg">🔌</span>
                  API 端点预览
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded bg-gray-900 px-3 py-2">
                    <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs font-medium text-white">
                      GET
                    </span>
                    <code className="text-sm text-gray-300">/api</code>
                  </div>
                  <div className="flex items-center gap-2 rounded bg-gray-900 px-3 py-2">
                    <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
                      POST
                    </span>
                    <code className="text-sm text-gray-300">/api/users</code>
                  </div>
                  <p className="text-xs text-gray-500">
                    * 启动服务器后可在 http://localhost:3000/api 访问 API
                  </p>
                </div>
              </div>
            )}

            {/* Environment Variables */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <span className="text-lg">⚙️</span>
                环境配置
              </h3>
              <div className="space-y-2 rounded bg-gray-900 p-3">
                <code className="block text-xs text-gray-400">
                  # .env 文件配置示例
                </code>
                <code className="block text-sm text-gray-300">
                  DATABASE_URL=postgresql://user:pass@localhost:5432/db
                </code>
                <code className="block text-sm text-gray-300">PORT=3000</code>
                <code className="block text-sm text-gray-300">
                  NODE_ENV=development
                </code>
              </div>
            </div>
          </div>
        ) : (
          /* Terminal Output */
          <div className="font-mono text-sm">
            {terminalOutput.map((line, i) => (
              <div
                key={i}
                className={`${
                  line.startsWith('$')
                    ? 'text-yellow-400'
                    : line.startsWith('✓') || line.startsWith('🚀')
                      ? 'text-green-400'
                      : line.includes('Error') || line.includes('error')
                        ? 'text-red-400'
                        : 'text-gray-300'
                }`}
              >
                {line || '\u00A0'}
              </div>
            ))}
            {activeTab === 'dev' || activeTab === 'start' ? (
              <div className="mt-4 flex items-center gap-2 text-gray-400">
                <span className="inline-block h-3 w-2 animate-pulse bg-gray-400" />
                等待请求...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 bg-gray-800 px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            下载项目后，在本地终端运行上述命令
          </span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">准备就绪</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BackendPreview;
