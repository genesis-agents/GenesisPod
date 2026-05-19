export interface SourceItem {
  id: string;
  title: string;
  preview?: string;
  contentKind: 'article' | 'video' | 'report' | 'note' | 'other';
  wordCount?: number;
  durationSec?: number;
  thumbnailUrl?: string;
  createdAt: string;
  tags?: string[];
}

export interface SourceListFilter {
  search?: string;
  tags?: string[];
  dateRange?: { from: string; to: string };
  cursor?: string;
  limit?: number;
}

export interface SourceListResult {
  items: SourceItem[];
  nextCursor?: string;
}

export interface SourceContentBundle {
  sourceType: string;
  sourceId: string;
  title: string;
  body: string;
  bodyMime: 'text/markdown' | 'text/html' | 'text/plain';
  sourceMetadata: Record<string, unknown>;
  displayMetadata: Record<string, unknown>;
}

export interface SocialDataSourceDescriptor {
  id: string;
  displayName: { 'zh-CN': string; 'en-US': string };
  icon: string;
  description: { 'zh-CN': string; 'en-US': string };
  contentKinds: ReadonlyArray<SourceItem['contentKind']>;
  maxItemsPerTask?: number;
}

export interface SocialDataSource extends SocialDataSourceDescriptor {
  listItems(userId: string, filter: SourceListFilter): Promise<SourceListResult>;
  fetchBundle(itemIds: string[], userId: string): Promise<SourceContentBundle[]>;
}
