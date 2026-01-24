'use client';

/**
 * Topic Credibility Panel - 可信度分析面板
 *
 * 展示研究报告的可信度评估
 */

import { Shield } from 'lucide-react';
import { CredibilityPanel } from '../panels/CredibilityPanel';
import { useTopicContent } from './TopicContentContext';

export function TopicCredibilityPanel() {
  const { topicId, report } = useTopicContent();

  if (!report) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Shield className="mb-3 h-12 w-12 text-gray-300" />
        <div className="mb-1 text-lg font-medium text-gray-900">
          暂无可信度报告
        </div>
        <div className="text-sm text-gray-500">
          研究完成后将自动生成可信度评估报告
        </div>
      </div>
    );
  }

  return <CredibilityPanel topicId={topicId} reportId={report.id} />;
}
