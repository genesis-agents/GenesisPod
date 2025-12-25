# AppShell Migration Guide

## Completed Files

The following files have been successfully migrated from Sidebar to AppShell:

- [x] frontend/app/ai-store/page.tsx
- [x] frontend/app/ai-simulation/page.tsx
- [x] frontend/app/ai-coding/page.tsx
- [x] frontend/app/ai-office/page.tsx
- [x] frontend/app/ai-teams/page.tsx
- [x] frontend/app/profile/page.tsx
- [x] frontend/app/feedback/page.tsx
- [x] frontend/app/notifications/page.tsx

## Files Remaining to Migrate

### Main Pages

- [ ] frontend/app/page.tsx (home page)
- [ ] frontend/app/whats-new/page.tsx
- [ ] frontend/app/knowledge-graph/page.tsx

### Layouts

- [ ] frontend/app/admin/layout.tsx
- [ ] frontend/app/ai-studio/layout.tsx

### Admin Pages

- [ ] frontend/app/admin/workspace/page.tsx
- [ ] frontend/app/admin/data-management/page.tsx

### AI Coding Sub-pages

- [ ] frontend/app/ai-coding/[projectId]/page.tsx
- [ ] frontend/app/ai-coding/new/page.tsx
- [ ] frontend/app/ai-coding/kanban/page.tsx

### Other Sub-pages

- [ ] frontend/app/notion/[pageId]/page.tsx
- [ ] frontend/app/ai-teams/[topicId]/page.tsx
- [ ] frontend/app/explore/resource/[id]/page.tsx
- [ ] frontend/app/explore/youtube/page.tsx
- [ ] frontend/app/ai-simulation/[id]/page.tsx
- [ ] frontend/app/ai-simulation/run/[id]/page.tsx
- [ ] frontend/app/ai-simulation/edit/[id]/page.tsx
- [ ] frontend/app/ai-office/slides/page.tsx
- [ ] frontend/app/ai-office/docs/page.tsx
- [ ] frontend/app/ai-office/designer/page.tsx

## Migration Pattern

For each file, make the following changes:

### 1. Update Import

```tsx
// OLD
import Sidebar from "@/components/layout/Sidebar";

// NEW
import AppShell from "@/components/layout/AppShell";
```

### 2. Update Opening JSX

```tsx
// OLD
return (
  <div className="flex h-screen bg-gray-50">
    <Sidebar />

// NEW
return (
  <AppShell>
```

### 3. Update Closing JSX

```tsx
// OLD
    </div>
  );
}

// NEW
    </AppShell>
  );
}
```

## Special Cases

### Multiple Return Statements

If a file has multiple return statements (e.g., loading state, auth check, main content), update ALL of them:

```tsx
// Loading state
if (loading) {
  return (
    <AppShell>
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    </AppShell>
  );
}

// Auth check
if (!user) {
  return (
    <AppShell>
      <main className="flex-1 p-12">
        <SignInPrompt />
      </main>
    </AppShell>
  );
}

// Main content
return (
  <AppShell>
    <main className="flex-1 overflow-auto">{/* Your content */}</main>
  </AppShell>
);
```

### Layout Files

For layout files (like `admin/layout.tsx` and `ai-studio/layout.tsx`), the pattern may be slightly different. Check the existing structure carefully before migrating.

## Benefits of AppShell

The AppShell component provides:

1. **Unified Layout**: Automatically includes both MobileNav and Sidebar
2. **Responsive**: Handles mobile/desktop layouts internally
3. **Consistent**: Ensures all pages have the same navigation structure
4. **Simpler Code**: One component instead of two

## Notes

- Always preserve the `className` prop values on the wrapper divs
- Keep all existing content and logic intact
- The AppShell component includes `<MobileNav />` and `<Sidebar />` internally
- Children passed to AppShell should typically be wrapped in a flex container with `flex-1`
