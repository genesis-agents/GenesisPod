'use client';

import { ReadStatus } from '@/hooks';

interface ReadStatusBadgeProps {
  status: ReadStatus;
  onChange?: (status: ReadStatus) => void;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig = {
  [ReadStatus.UNREAD]: {
    label: 'Unread',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-300',
    dotColor: 'bg-gray-400',
  },
  [ReadStatus.READING]: {
    label: 'Reading',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-300',
    dotColor: 'bg-blue-500',
  },
  [ReadStatus.COMPLETED]: {
    label: 'Completed',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    dotColor: 'bg-green-500',
  },
  [ReadStatus.ARCHIVED]: {
    label: 'Archived',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-300',
    dotColor: 'bg-amber-500',
  },
};

export default function ReadStatusBadge({
  status,
  onChange,
  showLabel = true,
  size = 'sm',
}: ReadStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig[ReadStatus.UNREAD];
  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  if (onChange) {
    return (
      <div className="relative">
        <select
          value={status}
          onChange={(e) => onChange(e.target.value as ReadStatus)}
          className={`cursor-pointer appearance-none rounded-full border ${config.borderColor} ${config.bgColor} ${config.textColor} ${sizeClasses} pr-6 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <svg
          className={`pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 ${config.textColor}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.borderColor} ${config.bgColor} ${config.textColor} ${sizeClasses} font-medium`}
    >
      <span className={`rounded-full ${config.dotColor} ${dotSize}`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
