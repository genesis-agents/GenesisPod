# SWR Quick Start Guide

## Installation

```bash
npm install swr
```

## Basic Usage

### 1. Fetch Connections

```typescript
import { useSocialConnectionsSWR } from '@/hooks/swr/useSocialSWR';

function ConnectionsList() {
  const { connections, isLoading, refresh } = useSocialConnectionsSWR();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      {connections.map(conn => (
        <div key={conn.id}>{conn.accountName}</div>
      ))}
    </div>
  );
}
```

### 2. Fetch Contents with Filter

```typescript
import { useSocialContentsSWR } from '@/hooks/swr/useSocialSWR';

function ContentsList() {
  const [status, setStatus] = useState('DRAFT');
  const { contents, isLoading } = useSocialContentsSWR({ status });

  // Automatically refetches when status changes
  return (
    <div>
      <select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="DRAFT">Draft</option>
        <option value="PUBLISHED">Published</option>
      </select>
      {contents.map(content => (
        <div key={content.id}>{content.title}</div>
      ))}
    </div>
  );
}
```

### 3. Show Cache Status

```typescript
import { Database } from 'lucide-react';

function MyComponent() {
  const { connections, isLoading, isValidating } = useSocialConnectionsSWR();

  return (
    <div>
      {!isLoading && isValidating && (
        <div className="text-blue-600">
          <Database className="animate-pulse" />
          <span>Refreshing...</span>
        </div>
      )}
      {!isLoading && !isValidating && connections.length > 0 && (
        <div className="text-green-600">
          <Database />
          <span>Cached</span>
        </div>
      )}
      {/* Your content here */}
    </div>
  );
}
```

### 4. Manual Refresh

```typescript
function MyComponent() {
  const { contents, refresh } = useSocialContentsSWR();

  const handleRefresh = async () => {
    await refresh();
    toast.success('Data refreshed');
  };

  return <button onClick={handleRefresh}>Refresh</button>;
}
```

### 5. Conditional Fetching

```typescript
function MyComponent() {
  const [enabled, setEnabled] = useState(false);
  const { connections } = useSocialConnectionsSWR(enabled);

  // Only fetches when enabled is true
  return (
    <div>
      <button onClick={() => setEnabled(true)}>Load Data</button>
      {/* Data appears here when enabled */}
    </div>
  );
}
```

### 6. Mutations

```typescript
import { useSocialConnectionsSWR } from '@/hooks/swr/useSocialSWR';
import { useSocialConnections } from '@/hooks/domain/useAISocial';

function MyComponent() {
  // SWR for reading
  const { connections, refresh } = useSocialConnectionsSWR();

  // Legacy hook for mutations
  const { removeConnection } = useSocialConnections();

  const handleDelete = async (id: string) => {
    await removeConnection(id);
    refresh(); // Refresh cache after mutation
  };

  return (
    <div>
      {connections.map(conn => (
        <div key={conn.id}>
          {conn.accountName}
          <button onClick={() => handleDelete(conn.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## Advanced Usage

### Custom Configuration

```typescript
const { connections } = useSocialConnectionsSWR({
  refreshInterval: 10000, // Refresh every 10 seconds
  revalidateOnFocus: false, // Don't refresh on window focus
});
```

### Error Handling

```typescript
const { connections, error, isLoading } = useSocialConnectionsSWR();

if (isLoading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;

return <div>{/* Your content */}</div>;
```

### Optimistic Updates

```typescript
import { mutateConnections } from '@/hooks/swr/useSocialSWR';

const { connections, mutate } = useSocialConnectionsSWR();

const handleToggle = async (id: string) => {
  // Optimistically update UI
  await mutateConnections(mutate, (current) =>
    current.map((conn) =>
      conn.id === id ? { ...conn, isActive: !conn.isActive } : conn
    )
  );

  // Then sync with server
  await toggleConnection(id);
};
```

## Caching Behavior

| Hook                      | Refresh Interval | Focus Refresh | Reconnect Refresh |
| ------------------------- | ---------------- | ------------- | ----------------- |
| `useSocialConnectionsSWR` | 5 minutes        | ✅            | ✅                |
| `useSocialContentsSWR`    | 1 minute         | ✅            | ✅                |
| `useSocialContentSWR`     | Manual only      | ❌            | ✅                |
| `useSocialPublishLogsSWR` | 30 seconds       | ✅            | ✅                |

## Common Patterns

### Loading Skeleton

```typescript
const { contents, isLoading } = useSocialContentsSWR();

if (isLoading) {
  return <ContentTableSkeleton rows={5} />;
}

return <ContentTable contents={contents} />;
```

### Refresh Button with Loading State

```typescript
const { refresh, isValidating } = useSocialConnectionsSWR();

return (
  <button
    onClick={refresh}
    disabled={isValidating}
  >
    <RefreshCw className={isValidating ? 'animate-spin' : ''} />
    Refresh
  </button>
);
```

### Pagination

```typescript
const [page, setPage] = useState(0);
const { contents } = useSocialContentsSWR({
  limit: 20,
  offset: page * 20,
});

// Automatically refetches when page changes
```

## Troubleshooting

### Data Not Updating?

1. Check if manual mutations are followed by `refresh()`
2. Verify cache keys match
3. Check network tab for API calls

### Too Many Requests?

1. Increase `dedupingInterval` in config
2. Reduce `refreshInterval`
3. Disable `revalidateOnFocus` if not needed

### Stale Data?

1. Check if `revalidateOnMount` is enabled
2. Verify network connectivity
3. Call `refresh()` manually

## Best Practices

1. ✅ Use SWR for reading data
2. ✅ Use legacy hooks for mutations
3. ✅ Call `refresh()` after mutations
4. ✅ Show loading states
5. ✅ Handle errors gracefully
6. ✅ Use conditional fetching when appropriate
7. ❌ Don't use `useEffect` to fetch data
8. ❌ Don't modify SWR cache directly

## Resources

- [Full Documentation](./README.md)
- [SWR Official Docs](https://swr.vercel.app/)
- [API Reference](../../lib/api/ai-social/README.md)
