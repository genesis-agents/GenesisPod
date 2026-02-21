'use client';

import { useRouter } from 'next/navigation';
import { Presentation } from 'lucide-react';

interface GenerateSlidesButtonProps {
  topicId: string;
  topicName?: string;
  className?: string;
}

export function GenerateSlidesButton({
  topicId,
  topicName,
  className,
}: GenerateSlidesButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    const params = new URLSearchParams();
    params.set('action', 'import');
    params.set('sourceType', 'research');
    params.set('sourceId', topicId);
    if (topicName) params.set('title', topicName);
    router.push(`/ai-office/slides?${params.toString()}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 ${className ?? ''}`}
      title="生成演示文稿"
    >
      <Presentation className="h-3.5 w-3.5" />
      <span>生成 PPT</span>
    </button>
  );
}
