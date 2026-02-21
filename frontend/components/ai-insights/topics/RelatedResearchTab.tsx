'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

interface ResearchProject {
  id: string;
  name: string;
  createdAt: string;
}

interface RelatedResearchTabProps {
  topicName: string;
}

export function RelatedResearchTab({ topicName }: RelatedResearchTabProps) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const fetchProjects = async () => {
      try {
        const params = new URLSearchParams({
          search: topicName.slice(0, 50),
          take: '5',
        });
        const resp = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects?${params.toString()}`,
          { headers: getAuthHeader(), signal: controller.signal }
        );
        if (!resp.ok) throw new Error('Failed to fetch projects');
        const data = (await resp.json()) as {
          data?: ResearchProject[];
          projects?: ResearchProject[];
        };
        const list = data.data ?? data.projects ?? [];
        setProjects(list);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.error('[RelatedResearchTab] fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchProjects();

    return () => controller.abort();
  }, [topicName]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">加载中...</div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="py-12 text-center">
        <FolderOpen className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">暂无相关研究项目</p>
        <a
          href="/ai-research"
          className="mt-2 block text-xs text-blue-600 hover:underline"
        >
          前往 AI 研究创建项目
        </a>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {projects.map((p) => (
        <a
          key={p.id}
          href={`/ai-research?projectId=${p.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
        >
          <span className="text-sm text-gray-800">{p.name}</span>
          <ExternalLink className="h-4 w-4 flex-shrink-0 text-gray-400" />
        </a>
      ))}
    </div>
  );
}
