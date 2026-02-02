import type { UIMessage } from '../shared/types';
import { safeString } from '@/lib/utils/common';
import { useI18n } from '@/lib/i18n';

interface ReviewCardProps {
  msg: UIMessage;
}

export function ReviewCard({ msg }: ReviewCardProps) {
  const { t } = useI18n();
  const safeContent = safeString(msg.content);
  const isPassed =
    safeContent.includes('通过') || safeContent.includes('passed');

  return (
    <div
      className={`rounded-lg border p-4 ${
        isPassed
          ? 'border-green-200 bg-green-50'
          : 'border-yellow-200 bg-yellow-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{isPassed ? '✅' : '⚠️'}</span>
        <span
          className={`font-medium ${isPassed ? 'text-green-800' : 'text-yellow-800'}`}
        >
          {t('topicResearch.messageCards.review.qualityReview')}
          {isPassed
            ? t('topicResearch.messageCards.review.passed')
            : t('topicResearch.messageCards.review.needsRevision')}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{safeContent}</p>
    </div>
  );
}
