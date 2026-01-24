'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * RAG 路由重定向页面
 * 此路由已移动至 /library/rag
 */
export default function RAGRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/library/rag');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="text-gray-600">正在跳转到 RAG 工作台...</p>
      </div>
    </div>
  );
}
