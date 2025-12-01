import { useImageSourceStore } from '@/stores/imageSourceStore';

export default function SourcePool() {
    const { sources, removeSource, clearSources } = useImageSourceStore();

    if (sources.length === 0) return null;

    return (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">
                    📚 Source Pool ({sources.length})
                </h3>
                <button
                    onClick={clearSources}
                    className="text-xs text-gray-500 hover:text-red-400"
                >
                    Clear
                </button>
            </div>
            <div className="space-y-2">
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
        </div>
    );
}
