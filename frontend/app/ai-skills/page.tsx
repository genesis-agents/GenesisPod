'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/lib/i18n';
import { TrendingUp, RefreshCw, ExternalLink } from 'lucide-react';

// 模拟统计数据 - 实际应从后端API获取
interface SkillsStats {
  totalSkills: number;
  lastUpdated: string;
  weeklyGrowth: number;
  trendData: { date: string; count: number }[];
}

const mockStats: SkillsStats = {
  totalSkills: 66541,
  lastUpdated: new Date().toISOString(),
  weeklyGrowth: 12.5,
  trendData: [
    { date: 'Nov 2', count: 2500 },
    { date: 'Nov 9', count: 3200 },
    { date: 'Nov 16', count: 4100 },
    { date: 'Nov 23', count: 5800 },
    { date: 'Nov 30', count: 7200 },
    { date: 'Dec 7', count: 9500 },
    { date: 'Dec 14', count: 12000 },
    { date: 'Dec 21', count: 18000 },
    { date: 'Dec 28', count: 28000 },
    { date: 'Jan 4', count: 38000 },
    { date: 'Jan 11', count: 45000 },
  ],
};

// 简单的面积图组件
function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count));
  const width = 320;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 30, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 生成路径
  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - (d.count / maxCount) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* 面积 */}
      <path d={areaPath} fill="url(#areaGradient)" />
      {/* 线条 */}
      <path d={linePath} fill="none" stroke="#f97316" strokeWidth="2" />
      {/* X轴标签 */}
      {data
        .filter((_, i) => i % 2 === 0)
        .map((d, i) => {
          const originalIndex = i * 2;
          const x =
            padding.left + (originalIndex / (data.length - 1)) * chartWidth;
          return (
            <text
              key={d.date}
              x={x}
              y={height - 8}
              textAnchor="middle"
              className="fill-gray-400 text-[9px]"
            >
              {d.date}
            </text>
          );
        })}
    </svg>
  );
}

// SkillsMP 主要分类 - 基于 https://skillsmp.com/categories
const categories = [
  { id: 'all', icon: '🎯', color: 'bg-gray-100' },
  { id: 'tools', icon: '🛠️', color: 'bg-blue-100' },
  { id: 'development', icon: '💻', color: 'bg-green-100' },
  { id: 'testing', icon: '🧪', color: 'bg-purple-100' },
  { id: 'documentation', icon: '📚', color: 'bg-amber-100' },
  { id: 'database', icon: '🗄️', color: 'bg-cyan-100' },
  { id: 'devops', icon: '🚀', color: 'bg-orange-100' },
  { id: 'security', icon: '🔒', color: 'bg-red-100' },
  { id: 'ai-agents', icon: '🤖', color: 'bg-indigo-100' },
];

// Skill 数据接口
interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  downloads?: string;
  tags: string[];
  featured: boolean;
  url: string;
  lastUpdated: string;
}

// TOP 50 Skills 种子数据 - 按分类组织
const topSkills: Skill[] = [
  // Tools Category - Productivity & Automation
  {
    id: 'commitizen',
    name: 'Commitizen',
    description: 'Standardize commit messages with conventional commit format',
    category: 'tools',
    author: 'commitizen',
    stars: 15200,
    downloads: '500K+',
    tags: ['git', 'commits', 'automation'],
    featured: true,
    url: 'https://github.com/commitizen/cz-cli',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'prettier-skill',
    name: 'Prettier Integration',
    description: 'Auto-format code with Prettier on save or commit',
    category: 'tools',
    author: 'prettier',
    stars: 48000,
    downloads: '1M+',
    tags: ['formatting', 'linting', 'automation'],
    featured: true,
    url: 'https://github.com/prettier/prettier',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'eslint-skill',
    name: 'ESLint Assistant',
    description: 'AI-powered ESLint configuration and error fixing',
    category: 'tools',
    author: 'eslint',
    stars: 24000,
    downloads: '800K+',
    tags: ['linting', 'javascript', 'typescript'],
    featured: true,
    url: 'https://github.com/eslint/eslint',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'husky-skill',
    name: 'Husky Git Hooks',
    description: 'Modern native git hooks made easy',
    category: 'tools',
    author: 'typicode',
    stars: 31000,
    downloads: '600K+',
    tags: ['git', 'hooks', 'automation'],
    featured: false,
    url: 'https://github.com/typicode/husky',
    lastUpdated: '2025-01-08',
  },
  {
    id: 'semantic-release',
    name: 'Semantic Release',
    description: 'Fully automated version management and package publishing',
    category: 'tools',
    author: 'semantic-release',
    stars: 19500,
    downloads: '400K+',
    tags: ['release', 'versioning', 'ci-cd'],
    featured: true,
    url: 'https://github.com/semantic-release/semantic-release',
    lastUpdated: '2025-01-09',
  },

  // Development Category - Full Stack & Frontend
  {
    id: 'react-patterns',
    name: 'React Patterns',
    description: 'Best practices and patterns for React development',
    category: 'development',
    author: 'react-patterns',
    stars: 12000,
    downloads: '300K+',
    tags: ['react', 'patterns', 'best-practices'],
    featured: true,
    url: 'https://github.com/krasimir/react-in-patterns',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'nextjs-skill',
    name: 'Next.js Development',
    description: 'Full-stack React framework patterns and optimizations',
    category: 'development',
    author: 'vercel',
    stars: 118000,
    downloads: '2M+',
    tags: ['nextjs', 'react', 'full-stack'],
    featured: true,
    url: 'https://github.com/vercel/next.js',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'typescript-skill',
    name: 'TypeScript Mastery',
    description: 'Advanced TypeScript patterns and type utilities',
    category: 'development',
    author: 'microsoft',
    stars: 96000,
    downloads: '1.5M+',
    tags: ['typescript', 'types', 'javascript'],
    featured: true,
    url: 'https://github.com/microsoft/TypeScript',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'tailwindcss-skill',
    name: 'Tailwind CSS Helper',
    description: 'Utility-first CSS framework patterns and components',
    category: 'development',
    author: 'tailwindlabs',
    stars: 78000,
    downloads: '1M+',
    tags: ['css', 'tailwind', 'styling'],
    featured: false,
    url: 'https://github.com/tailwindlabs/tailwindcss',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'nestjs-skill',
    name: 'NestJS Patterns',
    description: 'Enterprise Node.js framework patterns and best practices',
    category: 'development',
    author: 'nestjs',
    stars: 64000,
    downloads: '500K+',
    tags: ['nestjs', 'nodejs', 'backend'],
    featured: true,
    url: 'https://github.com/nestjs/nest',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'prisma-skill',
    name: 'Prisma ORM Helper',
    description: 'Next-generation ORM for Node.js and TypeScript',
    category: 'development',
    author: 'prisma',
    stars: 37000,
    downloads: '400K+',
    tags: ['orm', 'database', 'typescript'],
    featured: false,
    url: 'https://github.com/prisma/prisma',
    lastUpdated: '2025-01-08',
  },

  // Testing Category
  {
    id: 'jest-skill',
    name: 'Jest Testing',
    description: 'Delightful JavaScript Testing Framework',
    category: 'testing',
    author: 'facebook',
    stars: 43500,
    downloads: '800K+',
    tags: ['testing', 'jest', 'javascript'],
    featured: true,
    url: 'https://github.com/facebook/jest',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'playwright-skill',
    name: 'Playwright E2E',
    description: 'E2E testing for modern web apps with Playwright',
    category: 'testing',
    author: 'microsoft',
    stars: 62000,
    downloads: '600K+',
    tags: ['e2e', 'testing', 'automation'],
    featured: true,
    url: 'https://github.com/microsoft/playwright',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'vitest-skill',
    name: 'Vitest Runner',
    description: 'Blazing fast unit test framework powered by Vite',
    category: 'testing',
    author: 'vitest-dev',
    stars: 12000,
    downloads: '300K+',
    tags: ['testing', 'vite', 'unit-tests'],
    featured: true,
    url: 'https://github.com/vitest-dev/vitest',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'cypress-skill',
    name: 'Cypress Testing',
    description:
      'Fast, easy and reliable testing for anything that runs in a browser',
    category: 'testing',
    author: 'cypress-io',
    stars: 46000,
    downloads: '500K+',
    tags: ['e2e', 'testing', 'browser'],
    featured: false,
    url: 'https://github.com/cypress-io/cypress',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'testing-library',
    name: 'Testing Library',
    description:
      'Simple and complete testing utilities that encourage good practices',
    category: 'testing',
    author: 'testing-library',
    stars: 18500,
    downloads: '400K+',
    tags: ['testing', 'react', 'dom'],
    featured: false,
    url: 'https://github.com/testing-library/react-testing-library',
    lastUpdated: '2025-01-08',
  },

  // Documentation Category
  {
    id: 'typedoc-skill',
    name: 'TypeDoc Generator',
    description: 'Documentation generator for TypeScript projects',
    category: 'documentation',
    author: 'TypeStrong',
    stars: 7200,
    downloads: '200K+',
    tags: ['documentation', 'typescript', 'api-docs'],
    featured: true,
    url: 'https://github.com/TypeStrong/typedoc',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'storybook-skill',
    name: 'Storybook Docs',
    description: 'UI component workshop and documentation',
    category: 'documentation',
    author: 'storybookjs',
    stars: 82000,
    downloads: '700K+',
    tags: ['ui', 'documentation', 'components'],
    featured: true,
    url: 'https://github.com/storybookjs/storybook',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'swagger-skill',
    name: 'Swagger/OpenAPI',
    description: 'API documentation with OpenAPI specification',
    category: 'documentation',
    author: 'swagger-api',
    stars: 25000,
    downloads: '400K+',
    tags: ['api', 'documentation', 'openapi'],
    featured: true,
    url: 'https://github.com/swagger-api/swagger-ui',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'readme-skill',
    name: 'README Generator',
    description: 'Generate beautiful README files for your projects',
    category: 'documentation',
    author: 'community',
    stars: 3500,
    downloads: '100K+',
    tags: ['readme', 'markdown', 'documentation'],
    featured: false,
    url: 'https://github.com/kefranabg/readme-md-generator',
    lastUpdated: '2025-01-08',
  },
  {
    id: 'docusaurus-skill',
    name: 'Docusaurus Helper',
    description: 'Easy to maintain open source documentation websites',
    category: 'documentation',
    author: 'facebook',
    stars: 52000,
    downloads: '300K+',
    tags: ['documentation', 'static-site', 'react'],
    featured: false,
    url: 'https://github.com/facebook/docusaurus',
    lastUpdated: '2025-01-07',
  },

  // Database Category
  {
    id: 'postgresql-skill',
    name: 'PostgreSQL Helper',
    description: 'Advanced PostgreSQL queries and optimizations',
    category: 'database',
    author: 'postgres',
    stars: 14000,
    downloads: '250K+',
    tags: ['postgresql', 'sql', 'database'],
    featured: true,
    url: 'https://github.com/postgres/postgres',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'mongodb-skill',
    name: 'MongoDB Patterns',
    description: 'MongoDB query patterns and aggregation pipelines',
    category: 'database',
    author: 'mongodb',
    stars: 25000,
    downloads: '300K+',
    tags: ['mongodb', 'nosql', 'aggregation'],
    featured: true,
    url: 'https://github.com/mongodb/mongo',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'redis-skill',
    name: 'Redis Caching',
    description: 'Redis caching patterns and data structures',
    category: 'database',
    author: 'redis',
    stars: 63000,
    downloads: '400K+',
    tags: ['redis', 'caching', 'in-memory'],
    featured: false,
    url: 'https://github.com/redis/redis',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'drizzle-skill',
    name: 'Drizzle ORM',
    description: 'TypeScript ORM with zero dependencies',
    category: 'database',
    author: 'drizzle-team',
    stars: 20000,
    downloads: '200K+',
    tags: ['orm', 'typescript', 'sql'],
    featured: true,
    url: 'https://github.com/drizzle-team/drizzle-orm',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'neo4j-skill',
    name: 'Neo4j Graph DB',
    description: 'Graph database queries and Cypher patterns',
    category: 'database',
    author: 'neo4j',
    stars: 12000,
    downloads: '150K+',
    tags: ['graph', 'neo4j', 'cypher'],
    featured: false,
    url: 'https://github.com/neo4j/neo4j',
    lastUpdated: '2025-01-08',
  },

  // DevOps Category
  {
    id: 'docker-skill',
    name: 'Docker Mastery',
    description: 'Container patterns and Dockerfile best practices',
    category: 'devops',
    author: 'docker',
    stars: 67000,
    downloads: '1M+',
    tags: ['docker', 'containers', 'devops'],
    featured: true,
    url: 'https://github.com/docker/docker-ce',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'kubernetes-skill',
    name: 'Kubernetes Helper',
    description: 'K8s deployment patterns and configurations',
    category: 'devops',
    author: 'kubernetes',
    stars: 106000,
    downloads: '800K+',
    tags: ['kubernetes', 'k8s', 'orchestration'],
    featured: true,
    url: 'https://github.com/kubernetes/kubernetes',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'terraform-skill',
    name: 'Terraform IaC',
    description: 'Infrastructure as Code patterns with Terraform',
    category: 'devops',
    author: 'hashicorp',
    stars: 41000,
    downloads: '500K+',
    tags: ['terraform', 'iac', 'infrastructure'],
    featured: true,
    url: 'https://github.com/hashicorp/terraform',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'github-actions-skill',
    name: 'GitHub Actions',
    description: 'CI/CD workflows with GitHub Actions',
    category: 'devops',
    author: 'github',
    stars: 18000,
    downloads: '600K+',
    tags: ['ci-cd', 'github', 'automation'],
    featured: false,
    url: 'https://github.com/actions/runner',
    lastUpdated: '2025-01-08',
  },
  {
    id: 'nginx-skill',
    name: 'Nginx Configuration',
    description: 'Nginx server configurations and optimizations',
    category: 'devops',
    author: 'nginx',
    stars: 20000,
    downloads: '300K+',
    tags: ['nginx', 'web-server', 'proxy'],
    featured: false,
    url: 'https://github.com/nginx/nginx',
    lastUpdated: '2025-01-07',
  },

  // Security Category
  {
    id: 'snyk-skill',
    name: 'Snyk Security',
    description: 'Find and fix vulnerabilities in dependencies',
    category: 'security',
    author: 'snyk',
    stars: 4800,
    downloads: '200K+',
    tags: ['security', 'vulnerabilities', 'scanning'],
    featured: true,
    url: 'https://github.com/snyk/snyk',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'owasp-skill',
    name: 'OWASP Guidelines',
    description: 'Security best practices based on OWASP Top 10',
    category: 'security',
    author: 'OWASP',
    stars: 15000,
    downloads: '300K+',
    tags: ['security', 'owasp', 'best-practices'],
    featured: true,
    url: 'https://github.com/OWASP/CheatSheetSeries',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'auth-skill',
    name: 'Auth Patterns',
    description: 'Authentication and authorization patterns',
    category: 'security',
    author: 'community',
    stars: 8500,
    downloads: '150K+',
    tags: ['auth', 'jwt', 'oauth'],
    featured: false,
    url: 'https://github.com/auth0/node-jsonwebtoken',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'helmet-skill',
    name: 'Helmet Security',
    description: 'Secure Express apps with various HTTP headers',
    category: 'security',
    author: 'helmetjs',
    stars: 9800,
    downloads: '400K+',
    tags: ['security', 'express', 'headers'],
    featured: false,
    url: 'https://github.com/helmetjs/helmet',
    lastUpdated: '2025-01-08',
  },
  {
    id: 'trivy-skill',
    name: 'Trivy Scanner',
    description: 'Container and IaC security scanner',
    category: 'security',
    author: 'aquasecurity',
    stars: 21000,
    downloads: '250K+',
    tags: ['security', 'containers', 'scanning'],
    featured: true,
    url: 'https://github.com/aquasecurity/trivy',
    lastUpdated: '2025-01-12',
  },

  // AI Agents Category
  {
    id: 'langchain-skill',
    name: 'LangChain Agent',
    description: 'Build AI agents with LangChain framework',
    category: 'ai-agents',
    author: 'langchain-ai',
    stars: 85000,
    downloads: '600K+',
    tags: ['langchain', 'llm', 'agents'],
    featured: true,
    url: 'https://github.com/langchain-ai/langchain',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'autogpt-skill',
    name: 'AutoGPT Patterns',
    description: 'Autonomous AI agent patterns and workflows',
    category: 'ai-agents',
    author: 'Significant-Gravitas',
    stars: 162000,
    downloads: '400K+',
    tags: ['autogpt', 'autonomous', 'agents'],
    featured: true,
    url: 'https://github.com/Significant-Gravitas/AutoGPT',
    lastUpdated: '2025-01-11',
  },
  {
    id: 'crewai-skill',
    name: 'CrewAI Framework',
    description: 'Multi-agent orchestration framework',
    category: 'ai-agents',
    author: 'joaomdmoura',
    stars: 15000,
    downloads: '200K+',
    tags: ['crewai', 'multi-agent', 'orchestration'],
    featured: true,
    url: 'https://github.com/joaomdmoura/crewAI',
    lastUpdated: '2025-01-10',
  },
  {
    id: 'llamaindex-skill',
    name: 'LlamaIndex RAG',
    description: 'Data framework for LLM applications',
    category: 'ai-agents',
    author: 'jerryjliu',
    stars: 32000,
    downloads: '300K+',
    tags: ['rag', 'llm', 'indexing'],
    featured: false,
    url: 'https://github.com/run-llama/llama_index',
    lastUpdated: '2025-01-09',
  },
  {
    id: 'openai-skill',
    name: 'OpenAI Assistant',
    description: 'OpenAI API integration and prompt patterns',
    category: 'ai-agents',
    author: 'openai',
    stars: 52000,
    downloads: '800K+',
    tags: ['openai', 'gpt', 'api'],
    featured: true,
    url: 'https://github.com/openai/openai-python',
    lastUpdated: '2025-01-12',
  },
  {
    id: 'anthropic-skill',
    name: 'Claude Integration',
    description: 'Anthropic Claude API patterns and best practices',
    category: 'ai-agents',
    author: 'anthropics',
    stars: 8500,
    downloads: '150K+',
    tags: ['claude', 'anthropic', 'api'],
    featured: true,
    url: 'https://github.com/anthropics/anthropic-sdk-python',
    lastUpdated: '2025-01-11',
  },
];

export default function AISkillsPage() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'stars' | 'downloads' | 'name'>('stars');
  const [skills, setSkills] = useState<Skill[]>(topSkills);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [stats, setStats] = useState<SkillsStats>(mockStats);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // 模拟从后端获取同步时间
    const storedSync = localStorage.getItem('aiSkills_lastSync');
    if (storedSync) {
      setLastSync(storedSync);
    }
    // 模拟获取统计数据
    const storedStats = localStorage.getItem('aiSkills_stats');
    if (storedStats) {
      try {
        setStats(JSON.parse(storedStats));
      } catch {
        // 使用默认数据
      }
    }
  }, []);

  // 手动同步功能
  const handleSync = async () => {
    setIsSyncing(true);
    // 模拟同步延迟
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const now = new Date().toISOString();
    setLastSync(now);
    localStorage.setItem('aiSkills_lastSync', now);
    localStorage.setItem('aiSkills_stats', JSON.stringify(stats));
    setIsSyncing(false);
  };

  // 过滤和排序 Skills
  const filteredSkills = skills
    .filter((skill) => {
      const matchesCategory =
        selectedCategory === 'all' || skill.category === selectedCategory;
      const matchesSearch =
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'stars') return b.stars - a.stars;
      if (sortBy === 'downloads') {
        const parseDownloads = (d?: string) => {
          if (!d) return 0;
          return (
            parseFloat(d.replace(/[^0-9.]/g, '')) *
            (d.includes('M') ? 1000000 : d.includes('K') ? 1000 : 1)
          );
        };
        return parseDownloads(b.downloads) - parseDownloads(a.downloads);
      }
      return a.name.localeCompare(b.name);
    });

  const featuredSkills = skills.filter((skill) => skill.featured);

  const formatStars = (stars: number) => {
    if (stars >= 1000000) return `${(stars / 1000000).toFixed(1)}M`;
    if (stars >= 1000) return `${(stars / 1000).toFixed(1)}K`;
    return stars.toString();
  };

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto">
        {/* Hero Stats Section - SkillsMP Style */}
        <div className="border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white px-8 py-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Code-style stats display */}
            <div className="flex-1">
              <div className="font-mono mb-2 flex items-center gap-2 text-xs text-gray-400">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-red-400" />
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-yellow-400" />
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-green-400" />
                <span className="ml-2">skills.marketplace</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="font-mono text-xs text-gray-400">
                  // main.ts
                </div>
                <h1 className="font-mono mt-2 text-3xl font-bold text-gray-900 lg:text-4xl">
                  <span className="text-orange-500">&gt;</span> Agent Skills
                </h1>
                <h2 className="font-mono text-3xl font-bold text-gray-900 lg:text-4xl">
                  Marketplace
                  <span className="animate-pulse text-orange-500">|</span>
                </h2>
                <p className="font-mono mt-2 text-sm text-gray-500">
                  <span className="text-orange-500">&gt;</span> for Claude Code,
                  Codex &amp; ChatGPT
                </p>

                <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="font-mono">
                    <span className="text-blue-600">const</span>{' '}
                    <span className="text-purple-600">skills</span>{' '}
                    <span className="text-gray-600">=</span>{' '}
                    <span className="text-3xl font-bold text-orange-500">
                      {stats.totalSkills.toLocaleString()}
                    </span>
                    <span className="text-gray-600">;</span>
                  </div>
                  <div className="font-mono mt-1 text-xs text-gray-400">
                    // Discover open-source agent skills from GitHub
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-green-600">
                    <TrendingUp className="h-4 w-4" />
                    <span>+{stats.weeklyGrowth}% this week</span>
                  </div>
                  {lastSync && (
                    <div className="text-gray-400">
                      Last sync: {new Date(lastSync).toLocaleDateString()}
                    </div>
                  )}
                  <button
                    onClick={() => void handleSync()}
                    disabled={isSyncing}
                    className="flex items-center gap-1 rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-200 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                    />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Trend chart */}
            <div className="flex-shrink-0">
              <div className="font-mono mb-2 flex items-center gap-2 text-xs text-gray-400">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-red-400" />
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-yellow-400" />
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-green-400" />
                <span className="ml-2">trend-analytics.tsx</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <TrendChart data={stats.trendData} />
                <div className="font-mono mt-2 text-center text-[10px] text-gray-400">
                  Based on skill last push time, not same-day commit count
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mt-6 rounded-lg border-l-4 border-orange-400 bg-orange-50 p-4">
            <div className="font-mono text-xs text-gray-500">/**</div>
            <div className="font-mono text-sm text-gray-700">
              * Search with AI semantics or keywords, browse by category, sort
              by popularity.
            </div>
            <div className="font-mono text-sm text-gray-700">
              * All skills use the open SKILL.md standard and are ready to
              install
            </div>
            <div className="font-mono text-xs text-gray-500">*/</div>
          </div>

          {/* Link to SkillsMP */}
          <div className="mt-4 flex items-center justify-between">
            <a
              href="https://skillsmp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700"
            >
              <ExternalLink className="h-4 w-4" />
              Browse all {stats.totalSkills.toLocaleString()}+ skills on
              SkillsMP
            </a>
          </div>
        </div>

        {/* Search Header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {t('aiSkills.featured')}
                </h2>
                <p className="text-sm text-gray-500">
                  Top 50 curated skills for your workflow
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mt-6 flex gap-4">
              <div className="relative flex-1">
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={t('aiSkills.search.placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'stars' | 'downloads' | 'name')
                }
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="stars">{t('aiSkills.sort.byStars')}</option>
                <option value="downloads">
                  {t('aiSkills.sort.byDownloads')}
                </option>
                <option value="name">{t('aiSkills.sort.byName')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Featured Section */}
          {selectedCategory === 'all' && !searchQuery && (
            <section className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="text-xl">⭐</span> {t('aiSkills.featured')}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {featuredSkills.slice(0, 6).map((skill) => (
                  <a
                    key={skill.id}
                    href={skill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="absolute right-3 top-3">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {t('aiSkills.featuredBadge')}
                      </span>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-purple-100 text-xl">
                        {categories.find((c) => c.id === skill.category)
                          ?.icon || '📦'}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 group-hover:text-violet-600">
                          {skill.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                          {skill.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg
                            className="h-4 w-4 text-amber-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {formatStars(skill.stars)}
                        </span>
                        <span className="text-gray-400">by {skill.author}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Categories */}
          <section className="mb-8">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    selectedCategory === category.id
                      ? 'bg-violet-600 text-white shadow-md'
                      : `${category.color} text-gray-700 hover:shadow-sm`
                  }`}
                >
                  <span>{category.icon}</span>
                  <span>{t(`aiSkills.categories.${category.id}`)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Skills Grid */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t(`aiSkills.categories.${selectedCategory}`)}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filteredSkills.length} {t('aiSkills.skills')})
                </span>
              </h2>
            </div>

            {filteredSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 text-6xl">🔍</div>
                <h3 className="text-lg font-medium text-gray-900">
                  {t('aiSkills.empty.title')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {t('aiSkills.empty.description')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredSkills.map((skill) => (
                  <a
                    key={skill.id}
                    href={skill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-violet-50 to-purple-100 text-xl">
                        {categories.find((c) => c.id === skill.category)
                          ?.icon || '📦'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium text-gray-900 group-hover:text-violet-600">
                          {skill.name}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-0.5">
                            <svg
                              className="h-3.5 w-3.5 text-amber-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {formatStars(skill.stars)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span>{skill.author}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-gray-500">
                      {skill.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skill.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
                      {skill.downloads && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          {skill.downloads} downloads
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-400 group-hover:text-violet-500">
                        {t('aiSkills.view')} →
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* SkillsMP Attribution */}
          <section className="mt-12 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 p-8 text-center text-white">
            <h2 className="text-xl font-bold">
              {t('aiSkills.attribution.title')}
            </h2>
            <p className="mt-2 text-violet-100">
              {t('aiSkills.attribution.description')}
            </p>
            <a
              href="https://skillsmp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-medium text-violet-600 transition-all hover:bg-violet-50 hover:shadow-lg"
            >
              {t('aiSkills.attribution.button')}
            </a>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
