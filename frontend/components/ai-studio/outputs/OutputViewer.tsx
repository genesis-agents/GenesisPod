/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
'use client';

import React from 'react';
import { Loader2, RefreshCw, Download, AlertCircle } from 'lucide-react';

interface Output {
  id: string;
  type: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  content: string | null;
  error?: string;
  createdAt: string;
}

interface OutputViewerProps {
  output: Output;
  onRegenerate: () => void;
  onExport: (format: 'markdown' | 'json') => void;
}

export function OutputViewer({
  output,
  onRegenerate,
  onExport,
}: OutputViewerProps) {
  if (output.status === 'PENDING' || output.status === 'GENERATING') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <p className="mt-4 text-sm text-gray-500">
          {output.status === 'PENDING'
            ? 'Queued for generation...'
            : 'Generating content...'}
        </p>
      </div>
    );
  }

  if (output.status === 'FAILED') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="mt-4 text-sm text-red-600">
          {output.error || 'Generation failed'}
        </p>
        <button
          onClick={onRegenerate}
          className="mt-4 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  // Parse content
  let content: any = null;
  try {
    content = JSON.parse(output.content || '{}');
  } catch {
    content = { raw: output.content };
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-lg font-semibold text-gray-900">{output.title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </button>
          <button
            onClick={() => onExport('markdown')}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Content based on type */}
      <div className="prose max-w-none">
        {renderOutputContent(output.type, content)}
      </div>
    </div>
  );
}

function renderOutputContent(type: string, content: any) {
  switch (type) {
    case 'FAQ':
      return <FAQContent data={content} />;
    case 'STUDY_GUIDE':
      return <StudyGuideContent data={content} />;
    case 'BRIEFING_DOC':
      return <BriefingDocContent data={content} />;
    case 'TIMELINE':
      return <TimelineContent data={content} />;
    case 'TREND_REPORT':
      return <TrendReportContent data={content} />;
    case 'COMPARISON':
      return <ComparisonContent data={content} />;
    case 'KNOWLEDGE_GRAPH':
      return <KnowledgeGraphContent data={content} />;
    case 'AUDIO_OVERVIEW':
      return <AudioOverviewContent data={content} />;
    default:
      return <pre className="text-sm">{JSON.stringify(content, null, 2)}</pre>;
  }
}

// FAQ Component
function FAQContent({ data }: { data: any }) {
  if (!data.categories) return <p>No FAQ data</p>;

  return (
    <div className="space-y-6">
      {data.categories.map((cat: any, i: number) => (
        <div key={i}>
          <h3 className="mb-3 text-lg font-semibold text-purple-700">
            {cat.name}
          </h3>
          <div className="space-y-4">
            {cat.questions?.map((q: any, j: number) => (
              <div key={j} className="border-l-4 border-purple-200 pl-4">
                <p className="font-medium text-gray-900">{q.question}</p>
                <p className="mt-1 text-gray-600">{q.answer}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Study Guide Component
function StudyGuideContent({ data }: { data: any }) {
  if (!data.sections) return <p>No study guide data</p>;

  return (
    <div className="space-y-8">
      {data.sections.map((section: any, i: number) => (
        <div key={i}>
          <h3 className="mb-3 border-b pb-2 text-lg font-semibold text-purple-700">
            {section.title}
          </h3>

          {section.content && (
            <p className="mb-4 text-gray-700">{section.content}</p>
          )}

          {section.keyTerms && (
            <div className="grid gap-2">
              {section.keyTerms.map((term: any, j: number) => (
                <div key={j} className="rounded-lg bg-purple-50 p-3">
                  <span className="font-semibold text-purple-800">
                    {term.term}
                  </span>
                  <span className="ml-2 text-gray-600">{term.definition}</span>
                </div>
              ))}
            </div>
          )}

          {section.objectives && (
            <ul className="list-inside list-disc space-y-1">
              {section.objectives.map((obj: string, j: number) => (
                <li key={j} className="text-gray-700">
                  {obj}
                </li>
              ))}
            </ul>
          )}

          {section.questions && (
            <div className="space-y-3">
              {section.questions.map((q: any, j: number) => (
                <div key={j} className="rounded-lg bg-gray-50 p-3">
                  <p className="font-medium">{q.question}</p>
                  <p className="mt-1 text-sm text-gray-600">{q.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Briefing Doc Component
function BriefingDocContent({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {data.executiveSummary && (
        <div className="rounded-lg bg-purple-50 p-4">
          <h3 className="mb-2 font-semibold text-purple-800">
            Executive Summary
          </h3>
          <p className="text-gray-700">{data.executiveSummary}</p>
        </div>
      )}

      {data.keyFindings && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">Key Findings</h3>
          <div className="space-y-2">
            {data.keyFindings.map((f: any, i: number) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded border p-2"
              >
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    f.importance === 'high'
                      ? 'bg-red-100 text-red-700'
                      : f.importance === 'medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {f.importance}
                </span>
                <p className="text-gray-700">{f.finding}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recommendations && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">Recommendations</h3>
          <div className="space-y-2">
            {data.recommendations.map((r: any, i: number) => (
              <div key={i} className="border-l-4 border-green-400 py-2 pl-4">
                <p className="font-medium">{r.action}</p>
                <p className="text-sm text-gray-500">{r.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.nextSteps && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">Next Steps</h3>
          <ol className="list-inside list-decimal space-y-1">
            {data.nextSteps.map((step: string, i: number) => (
              <li key={i} className="text-gray-700">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Timeline Component
function TimelineContent({ data }: { data: any }) {
  if (!data.events) return <p>No timeline data</p>;

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-4 top-0 w-0.5 bg-purple-200" />
      <div className="space-y-6">
        {data.events.map((event: any, i: number) => (
          <div key={i} className="relative pl-10">
            <div
              className={`absolute left-2 h-4 w-4 rounded-full ${
                event.importance === 'major' ? 'bg-purple-600' : 'bg-purple-300'
              }`}
            />
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-sm font-medium text-purple-600">
                {event.date}
              </div>
              <div className="font-semibold text-gray-900">{event.title}</div>
              <p className="mt-1 text-sm text-gray-600">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trend Report Component
function TrendReportContent({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {data.overview && (
        <p className="rounded-lg bg-gray-50 p-4 text-gray-700">
          {data.overview}
        </p>
      )}

      {data.trends && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">
            Identified Trends
          </h3>
          <div className="grid gap-4">
            {data.trends.map((trend: any, i: number) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{trend.name}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      trend.direction === 'rising'
                        ? 'bg-green-100 text-green-700'
                        : trend.direction === 'declining'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {trend.direction} ↑
                  </span>
                </div>
                <p className="text-sm text-gray-600">{trend.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.predictions && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">Predictions</h3>
          <div className="space-y-2">
            {data.predictions.map((p: any, i: number) => (
              <div
                key={i}
                className="border-l-4 border-yellow-400 bg-yellow-50 p-3"
              >
                <p className="font-medium">{p.prediction}</p>
                <p className="text-sm text-gray-500">
                  {p.timeframe} • {p.probability} probability
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Comparison Component
function ComparisonContent({ data }: { data: any }) {
  if (!data.dimensions || !data.subjects) return <p>No comparison data</p>;

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-purple-50">
              <th className="border p-3 text-left">Dimension</th>
              {data.subjects.map((s: string, i: number) => (
                <th key={i} className="border p-3 text-left font-semibold">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.dimensions.map((dim: any, i: number) => (
              <tr key={i}>
                <td className="border bg-gray-50 p-3 font-medium">
                  {dim.name}
                </td>
                {data.subjects.map((s: string, j: number) => (
                  <td key={j} className="border p-3">
                    <div className="font-medium">
                      {dim.values?.[s]?.value || '-'}
                    </div>
                    {dim.values?.[s]?.notes && (
                      <div className="mt-1 text-xs text-gray-500">
                        {dim.values[s].notes}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.summary && (
        <div className="rounded-lg bg-purple-50 p-4">
          <h3 className="mb-2 font-semibold">Summary</h3>
          <p className="text-gray-700">{data.summary.rationale}</p>
        </div>
      )}
    </div>
  );
}

// Knowledge Graph Component (简化版)
function KnowledgeGraphContent({ data }: { data: any }) {
  if (!data.nodes) return <p>No knowledge graph data</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {data.nodes.length} nodes, {data.edges?.length || 0} connections
      </p>

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {data.nodes.map((node: any) => (
          <div key={node.id} className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  node.type === 'concept'
                    ? 'bg-blue-500'
                    : node.type === 'entity'
                      ? 'bg-green-500'
                      : node.type === 'person'
                        ? 'bg-yellow-500'
                        : 'bg-gray-500'
                }`}
              />
              <span className="font-medium">{node.label}</span>
            </div>
            {node.description && (
              <p className="mt-1 text-xs text-gray-500">{node.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Audio Overview Component
function AudioOverviewContent({ data }: { data: any }) {
  if (!data.script?.segments) return <p>No audio script data</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
        Estimated duration: {data.script.estimatedDuration || '10-15 minutes'}
      </div>

      <div className="space-y-3">
        {data.script.segments.map((seg: any, i: number) => (
          <div
            key={i}
            className={`rounded-lg p-3 ${
              seg.speaker === 'Host1'
                ? 'ml-0 mr-12 bg-blue-50'
                : 'ml-12 mr-0 bg-green-50'
            }`}
          >
            <div className="mb-1 text-xs font-medium text-gray-500">
              {seg.speaker} {seg.emotion && `(${seg.emotion})`}
            </div>
            <p className="text-gray-800">{seg.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
