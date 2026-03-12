'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowDown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';
import type {
  DiagramConfig,
  LayerData,
  ArrowData,
  DepCardData,
  LegendItem,
} from '@/lib/admin/dependency-diagrams';

// --- Styling constants ---

const LEVEL_COLORS: Record<
  number,
  { bg: string; border: string; badge: string }
> = {
  4: {
    bg: 'bg-blue-50/60',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  3: {
    bg: 'bg-teal-50/60',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-700',
  },
  2: {
    bg: 'bg-purple-50/60',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
  },
  1: {
    bg: 'bg-amber-50/60',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
};

const TAG_STYLES: Record<string, string> = {
  service: 'bg-teal-50 text-teal-600 border-teal-100',
  registry: 'bg-amber-50 text-amber-600 border-amber-100',
  type: 'bg-purple-50 text-purple-600 border-purple-100',
  util: 'bg-rose-50 text-rose-600 border-rose-100',
  muted: 'bg-gray-50 text-gray-400 border-gray-100',
};

const COUNT_STYLES: Record<string, string> = {
  high: 'bg-blue-50 text-blue-700',
  mid: 'bg-teal-50 text-teal-700',
  low: 'bg-gray-100 text-gray-600',
};

const ARROW_COLORS: Record<string, string> = {
  blue: 'text-blue-500',
  teal: 'text-teal-500',
  purple: 'text-purple-500',
  amber: 'text-amber-500',
};

// --- Sub-components ---

function LayerModule({ data }: { data: LayerData }) {
  const c = LEVEL_COLORS[data.level] ?? LEVEL_COLORS[1];
  return (
    <div className={cn('rounded-lg border', c.border, c.bg)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold',
            c.badge
          )}
        >
          {data.tag}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {data.name}
            </span>
            <span className="font-mono hidden text-xs text-gray-400 sm:inline">
              {data.path}
            </span>
          </div>
          <span className="text-xs text-gray-500">{data.stats}</span>
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-semibold',
            c.badge
          )}
        >
          L{data.level}
        </span>
      </div>

      {/* Internal grid */}
      {data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.items.map((item) => (
            <div
              key={item.name}
              className="rounded-md border border-gray-200/60 bg-white/70 px-2.5 py-1.5"
            >
              <div className="text-xs font-semibold text-gray-700">
                {item.name}
              </div>
              <div className="text-[10px] leading-tight text-gray-400">
                {item.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Registrations */}
      {data.registrations && data.registrations.length > 0 && (
        <div className="px-4 pb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            onModuleInit Registrations
          </div>
          <div className="flex flex-wrap gap-1">
            {data.registrations.map((r) => (
              <span
                key={r}
                className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Facade */}
      {data.facade && (
        <div className="mx-4 mb-3 rounded-md border border-dashed border-blue-200/60 bg-blue-50/30 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
            <div className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
            {data.facade.title}
          </div>
          <div className="flex flex-wrap gap-1">
            {data.facade.exports.map((e) => (
              <span
                key={e.label}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px]',
                  TAG_STYLES[e.kind]
                )}
              >
                {e.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {data.footer && (
        <div className="px-4 pb-3 text-center text-[10px] text-gray-400">
          {data.footer}
        </div>
      )}
    </div>
  );
}

function ArrowConnector({ data }: { data: ArrowData }) {
  if (data.segments.length === 0) {
    return (
      <div className="flex justify-center py-1">
        <div className="flex flex-col items-center">
          <div className="h-4 w-px bg-gray-200" />
          <ArrowDown className="h-3 w-3 text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-6 py-2">
      {data.segments.map((seg) => (
        <div key={seg.label} className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 shadow-sm">
            <span
              className={cn(
                'text-xs font-bold',
                ARROW_COLORS[seg.color] ?? 'text-gray-500'
              )}
            >
              {seg.count}
            </span>
            <span className="text-[10px] text-gray-400">via</span>
            <code
              className={cn(
                'text-[10px] font-medium',
                ARROW_COLORS[seg.color] ?? 'text-gray-500'
              )}
            >
              {seg.label}
            </code>
          </div>
          <ArrowDown className="h-3 w-3 text-gray-300" />
        </div>
      ))}
    </div>
  );
}

function DepCard({ card }: { card: DepCardData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <span className={cn('text-sm font-semibold', card.fromColor)}>
          {card.from}
        </span>
        <span className="text-gray-300">&rarr;</span>
        <span className={cn('text-sm font-semibold', card.toColor)}>
          {card.to}
        </span>
      </div>
      <div className="px-4 py-2">
        {card.rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between border-b border-gray-50 py-1.5 last:border-b-0"
          >
            <span className="text-xs text-gray-600">{row.label}</span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                COUNT_STYLES[row.level]
              )}
            >
              {row.count}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-2">
          <span className="text-xs font-semibold text-gray-700">Total</span>
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
            {card.total}
          </span>
        </div>
        {card.note && (
          <p className="mt-2 text-[10px] text-gray-400">{card.note}</p>
        )}
      </div>
    </div>
  );
}

function LegendBar({ items }: { items: LegendItem[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-4 pb-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-sm',
              item.dashed ? 'border border-dashed' : '',
              item.color
            )}
          />
          <span className="text-[10px] text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Main renderer ---

interface DependencyDiagramProps {
  config: DiagramConfig;
}

export default function DependencyDiagram({ config }: DependencyDiagramProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/overview"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {t(config.titleKey)}
            </h1>
            <p className="text-xs text-gray-500">{t(config.subtitleKey)}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto max-w-5xl space-y-0">
          {/* Layer diagram */}
          {config.layers.map((layer, i) => (
            <div key={layer.tag}>
              <LayerModule data={layer} />
              {i < config.layers.length - 1 && (
                <ArrowConnector data={config.arrows[i]} />
              )}
            </div>
          ))}

          {/* Dependency summary */}
          {config.depCards.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {config.depCards.map((card) => (
                <DepCard key={`${card.from}-${card.to}`} card={card} />
              ))}
            </div>
          )}

          {/* Key invariant */}
          {config.footerNote && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-center text-xs text-gray-500">
              <span className="font-semibold text-gray-700">
                Key invariant:
              </span>{' '}
              {config.footerNote}
            </div>
          )}

          {/* Legend */}
          {config.legend.length > 0 && <LegendBar items={config.legend} />}
        </div>
      </main>
    </div>
  );
}
