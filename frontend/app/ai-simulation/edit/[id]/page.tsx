'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

interface ScenarioDetail {
  id: string;
  name: string;
  industry: string;
  region?: string;
  goals?: any;
  constraints?: any;
  params?: any;
  companies?: any[];
  agents?: any[];
  createdAt: string;
  updatedAt: string;
}

export default function EditScenarioPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const scenarioId = params?.id as string;

  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && scenarioId) {
      void fetchScenario();
    }
  }, [user, scenarioId]);

  const fetchScenario = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/scenarios/${scenarioId}`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (res.ok) {
        const data = await res.json();
        setScenario(data);
      }
    } catch (err) {
      console.error('Failed to fetch scenario:', err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </main>
      </div>
    );
  }

  if (!user || !scenario) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-6xl">404</div>
            <div className="mb-4 text-gray-500">场景不存在或无权访问</div>
            <button
              onClick={() => router.push('/ai-simulation')}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              返回场景列表
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 重定向到主页面并打开编辑器
  // 由于编辑器是在主页面的Modal中，我们重定向并传递参数
  useEffect(() => {
    if (scenario) {
      // 存储到sessionStorage，主页面读取后打开编辑器
      sessionStorage.setItem('editScenarioId', scenario.id);
      router.push('/ai-simulation');
    }
  }, [scenario, router]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <div className="text-gray-500">正在跳转到编辑器...</div>
        </div>
      </main>
    </div>
  );
}
