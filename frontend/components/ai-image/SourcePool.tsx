import { useState } from 'react';
import { useImageSourceStore } from '@/stores/imageSourceStore';

export default function SourcePool() {
    const { sources, removeSource, clearSources } = useImageSourceStore();
    const [isCollapsed, setIsCollapsed] = useState(false);

    if (sources.length === 0) return null;

    return (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white"
                >
                    <svg
                        className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    📚 Source Pool ({sources.length})
                </button>

                {!isCollapsed && (
                    <button
                        onClick={clearSources}
                        className="text-xs text-gray-500 hover:text-red-400"
                    >
                        Clear
                    </button>
                )}
            </div>

            {!isCollapsed && (
                <div className="mt-2 space-y-2">
                    {sources.map((source) => (
                        <div
                            key={source.id}
                            className="flex items-center justify-between rounded bg-white/5 p-2 text-xs transition hover:bg-white/10"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="flex-shrink-0 text-lg">
                                    {source.type === 'paper' ? '📄' :
                                        source.type === 'youtube' ? '🎬' :
                                            source.type === 'news' ? '📰' : '🔗'}
                                </span>
                                <span className="truncate text-gray-300" title={source.title}>
                                    {source.title}
                                </span>
                            </div>
                            <button
                                onClick={() => removeSource(source.id)}
                                className="ml-2 flex-shrink-0 text-gray-500 hover:text-red-400"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
