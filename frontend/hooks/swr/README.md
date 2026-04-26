# SWR Hooks for AI Social Module

## Overview

This directory contains SWR (Stale-While-Revalidate) hooks for optimized data fetching and caching in the AI Social module.

## Benefits

1. **Automatic Caching**: Data is cached and reused across components
2. **Background Revalidation**: Stale data is shown while fresh data is fetched
3. **Focus Revalidation**: Auto-refresh when window regains focus
4. **Deduplication**: Multiple requests for the same data are deduplicated
5. **Optimistic Updates**: UI updates immediately, then syncs with server
6. **Error Retry**: Automatic retry on network failures

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Components                                       │
│  - ConnectionsTab.tsx                                   │
│  - ContentsTab.tsx                                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  SWR Hooks Layer (with Caching)                         │
│  - useSocialConnectionsSWR()                            │
│  - useSocialContentsSWR()                               │
│  - useSocialContentSWR()                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Legacy Hooks Layer (for Mutations)                     │
│  - useSocialConnections() - mutations only              │
│  - useSocialContents() - mutations only                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  API Layer                                              │
│  - @/services/ai-social/api                                  │
└─────────────────────────────────────────────────────────┘
```

## Usage

### Basic Fetching

```typescript
import { useSocialConnectionsSWR } from '@/hooks/swr/useSocialSWR';

function MyComponent() {
  const { connections, isLoading, isValidating, refresh, error } =
    useSocialConnectionsSWR();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {connections.map(conn => (
        <div key={conn.id}>{conn.accountName}</div>
      ))}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

### Conditional Fetching

```typescript
// Only fetch when user is authenticated
const { connections } = useSocialConnectionsSWR(isAuthenticated);

// Only fetch when ID is available
const { content } = useSocialContentSWR(contentId || null);
```

### With Filters

```typescript
// Fetch contents with status filter
const { contents } = useSocialContentsSWR({
  status: 'PUBLISHED',
  limit: 20,
});

// Filter updates automatically trigger refetch
const [status, setStatus] = useState<ContentStatus>('DRAFT');
const { contents } = useSocialContentsSWR({ status });
```

### Manual Refresh

```typescript
const { contents, refresh } = useSocialContentsSWR();

// Manually refresh data
const handleRefresh = async () => {
  await refresh();
  toast.success('Data refreshed');
};
```

### Loading States

```typescript
const { isLoading, isValidating } = useSocialContentsSWR();

// isLoading: Initial data fetch
// isValidating: Background revalidation

{isLoading && <Spinner />}
{!isLoading && isValidating && <span>Refreshing...</span>}
```

## Caching Strategy

### Connections List

- **Revalidate Interval**: 5 minutes
- **Focus Revalidation**: Enabled
- **Reconnect Revalidation**: Enabled
- **Use Case**: Infrequently changing platform connections

### Contents List

- **Revalidate Interval**: 1 minute
- **Focus Revalidation**: Enabled
- **Reconnect Revalidation**: Enabled
- **Use Case**: Frequently updated content list

### Content Detail

- **Revalidate Interval**: Disabled (manual only)
- **Focus Revalidation**: Disabled
- **Reconnect Revalidation**: Enabled
- **Use Case**: Content editing (avoid disrupting user edits)

### Publish Logs

- **Revalidate Interval**: 30 seconds
- **Focus Revalidation**: Enabled
- **Reconnect Revalidation**: Enabled
- **Use Case**: Real-time publishing status

## Cache Keys

Cache keys are generated automatically:

```typescript
// Connections
'/api/ai-social/connections';
'/api/ai-social/connections/:id';
'/api/ai-social/connections/platform/:type';

// Contents
'/api/ai-social/contents';
'/api/ai-social/contents?status=DRAFT';
'/api/ai-social/contents/:id';

// Logs
'/api/ai-social/contents/:id/logs';
```

## Mutations

For data mutations (create, update, delete), use legacy hooks:

```typescript
import {
  useSocialConnections,
  useSocialContents,
} from '@/hooks/domain/useAISocial';
import { useSocialConnectionsSWR } from '@/hooks/swr/useSocialSWR';

function MyComponent() {
  // SWR for reading
  const { connections, refresh } = useSocialConnectionsSWR();

  // Legacy hook for mutations
  const { removeConnection } = useSocialConnections();

  const handleDelete = async (id: string) => {
    await removeConnection(id);
    refresh(); // Refresh SWR cache after mutation
  };
}
```

## Optimistic Updates

For instant UI feedback:

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

## Cache Invalidation

Invalidate all related caches after mutations:

```typescript
import { invalidateConnectionsCaches } from '@/hooks/swr/useSocialSWR';
import { useSWRConfig } from 'swr';

const { mutate: globalMutate } = useSWRConfig();

// After creating a new connection
await createConnection(data);
invalidateConnectionsCaches(globalMutate);
```

## Testing

Tests are provided in `useSocialSWR.test.ts`:

```bash
npm run test -- useSocialSWR
```

## Migration Guide

### Before (Legacy Hooks)

```typescript
const { connections, loading, fetchConnections } = useSocialConnections();

useEffect(() => {
  fetchConnections();
}, [fetchConnections]);
```

### After (SWR Hooks)

```typescript
const { connections, isLoading, refresh } = useSocialConnectionsSWR();

// No useEffect needed - SWR handles initial fetch
```

## Configuration

Global SWR configuration is in `@/lib/swr/social-config.ts`:

```typescript
import { socialSWRConfig } from '@/lib/swr/social-config';

// Customize per-hook
const { connections } = useSocialConnectionsSWR({
  ...socialSWRConfig,
  refreshInterval: 10000, // 10 seconds
});
```

## Performance Tips

1. **Enable conditional fetching** when data isn't needed
2. **Use optimistic updates** for better UX
3. **Leverage cache** by sharing SWR keys across components
4. **Disable focus revalidation** during data entry
5. **Use proper cache keys** to avoid unnecessary refetches

## Troubleshooting

### Data not updating?

- Check if `revalidateOnFocus` is enabled
- Manually call `refresh()` after mutations
- Verify cache keys match

### Too many requests?

- Increase `dedupingInterval`
- Reduce `refreshInterval`
- Disable `revalidateOnFocus` if not needed

### Stale data showing?

- Check `revalidateOnMount` setting
- Verify network connectivity
- Check if errors are being swallowed

## References

- [SWR Documentation](https://swr.vercel.app/)
- [AI Social API Docs](../../lib/api/ai-social/README.md)
- [Legacy Hooks](../domain/useAISocial.ts)
