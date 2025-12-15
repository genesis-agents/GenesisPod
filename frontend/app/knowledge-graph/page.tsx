'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

// 懒加载 D3 图谱组件
const KnowledgeGraphView = dynamic(
  () => import('@/components/shared/views/KnowledgeGraphView'),
  { ssr: false, loading: () => <GraphLoadingSkeleton /> }
);

interface GraphNode {
  id: string;
  label: string;
  type: 'Resource' | 'Author' | 'Topic' | 'Tag';
  properties: {
    title?: string;
    username?: string;
    name?: string;
  };
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphOverview {
  nodes: GraphNode[];
  edges: GraphLink[];
  stats: {
    totalResources: number;
    totalAuthors: number;
    totalTopics: number;
    totalTags: number;
    totalEdges: number;
  };
}

function GraphLoadingSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-gradient-to-r from-purple-400 to-blue-400" />
        <p className="mt-4 text-gray-600">Loading knowledge graph...</p>
      </div>
    </div>
  );
}

function EmptyState({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
          <svg
            className="h-12 w-12 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-bold text-gray-900">
          Knowledge Graph is Empty
        </h2>
        <p className="mt-2 max-w-md text-gray-600">
          Build connections between your resources, authors, topics, and tags to
          discover hidden relationships and insights.
        </p>
        <button
          onClick={onBuild}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-all hover:shadow-xl"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Build Knowledge Graph
        </button>
      </div>
    </div>
  );
}

export default function KnowledgeGraphPage() {
  const [graphData, setGraphData] = useState<GraphOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const fetchGraphOverview = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${config.apiUrl}/knowledge-graph/overview`,
        {
          headers: {
            ...getAuthHeader(),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch knowledge graph');
      }

      const data = await response.json();
      setGraphData(data);
    } catch (err) {
      console.error('Error fetching graph:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const buildGraph = async () => {
    try {
      setBuilding(true);
      setError(null);

      const response = await fetch(
        `${config.apiUrl}/knowledge-graph/build-all`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to build knowledge graph');
      }

      // Refresh the graph after building
      await fetchGraphOverview();
    } catch (err) {
      console.error('Error building graph:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBuilding(false);
    }
  };

  useEffect(() => {
    fetchGraphOverview();
  }, []);

  const hasData = graphData && graphData.nodes && graphData.nodes.length > 0;

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Knowledge Graph
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Explore connections between resources, authors, topics, and tags
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasData && (
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {graphData.stats?.totalResources || 0} Resources
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {graphData.stats?.totalAuthors || 0} Authors
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  {graphData.stats?.totalTopics || 0} Topics
                </span>
              </div>
            )}
            <button
              onClick={buildGraph}
              disabled={building}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {building ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Building...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Rebuild
                </>
              )}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <GraphLoadingSkeleton />
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-8 w-8 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="mt-4 text-gray-600">{error}</p>
                <button
                  onClick={fetchGraphOverview}
                  className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : hasData ? (
            <KnowledgeGraphView
              nodes={graphData.nodes}
              edges={graphData.edges}
            />
          ) : (
            <EmptyState onBuild={buildGraph} />
          )}
        </div>
      </main>
    </div>
  );
}
