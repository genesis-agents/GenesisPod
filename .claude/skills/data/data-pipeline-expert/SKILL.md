---
name: Data Pipeline Expert
description: Unified data collection, quality management, and pipeline orchestration for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - data
  - crawler
  - collection
  - deduplication
  - quality
  - pipeline
  - etl
boundaries:
  includes:
    - Data collection pipeline design
    - Crawler implementation
    - Deduplication strategies
    - Data quality monitoring
    - Anomaly detection
    - Data lifecycle management
  excludes:
    - Database schema design (use database-manager)
    - AI/ML model development (use ai-app-developer)
    - API endpoint development (use api-developer)
  handoff:
    - skill: database-manager
      when: Need schema changes or migrations
    - skill: devops-platform
      when: Need to deploy data services
---

# Data Pipeline Expert

You are an expert at designing and implementing data collection, quality management, and pipeline orchestration for DeepDive Engine.

## Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Data Pipeline Overview                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  External Sources → Crawlers → Processing → Quality → Storage   │
│       ↓                ↓            ↓           ↓        ↓      │
│  ┌─────────┐    ┌──────────┐  ┌─────────┐  ┌────────┐ ┌──────┐ │
│  │ Web     │    │ Raw Data │  │ ETL     │  │Quality │ │ Final│ │
│  │ APIs    │ →  │ (MongoDB)│ →│ Pipeline│ →│ Checks │→│ Data │ │
│  │ Files   │    │          │  │         │  │        │ │      │ │
│  └─────────┘    └──────────┘  └─────────┘  └────────┘ └──────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

```
backend/src/modules/data-services/
├── data-collection/
│   ├── collection-task.service.ts      # Task orchestration
│   ├── collection-task.controller.ts   # API endpoints
│   └── dto/
├── crawler/
│   ├── hackernews.service.ts           # HackerNews crawler
│   ├── rss-parser.service.ts           # RSS feed parser
│   └── deduplication.service.ts        # Crawler-level dedup
├── data-quality/
│   ├── quality-checker.service.ts      # Quality checks
│   ├── anomaly-detector.service.ts     # Anomaly detection
│   └── quality-report.service.ts       # Report generation
└── common/
    └── deduplication/
        ├── deduplication.service.ts    # Global deduplication
        └── unified-deduplication.service.ts
```

---

## Part 1: Data Collection

### Task Flow

```typescript
// Collection Task States
enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Task Execution Flow
async execute(taskId: string): Promise<void> {
  const task = await this.findTask(taskId);

  try {
    // 1. Update status to running
    await this.updateStatus(taskId, TaskStatus.RUNNING);

    // 2. Fetch data from source
    const rawData = await this.fetchFromSource(task.source);

    // 3. Deduplicate
    const uniqueData = await this.deduplicationService.filter(rawData);

    // 4. Store raw data with source reference
    await this.storeRawData(uniqueData, task.sourceId);

    // 5. Process and create resources
    const resources = await this.processToResources(uniqueData);

    // 6. Establish bi-directional references
    await this.linkRawDataToResources(uniqueData, resources);

    // 7. Mark complete
    await this.updateStatus(taskId, TaskStatus.COMPLETED);
  } catch (error) {
    await this.handleError(taskId, error);
  }
}
```

### Source-Specific Handlers

#### HackerNews

```typescript
async fetchTopStories(limit = 30): Promise<HNStory[]> {
  const storyIds = await this.fetchStoryIds('topstories');
  const stories = await Promise.all(
    storyIds.slice(0, limit).map(id => this.fetchItem(id))
  );

  return stories
    .filter(s => s && s.url)
    .map(s => this.enrichStory(s));
}
```

#### RSS Feeds

```typescript
async parseRssFeed(feedUrl: string): Promise<RssItem[]> {
  const feed = await this.parser.parseURL(feedUrl);
  return feed.items.map(item => ({
    title: item.title,
    url: item.link,
    content: item.contentSnippet || item.content,
    publishedAt: new Date(item.pubDate),
    source: feed.title,
  }));
}
```

---

## Part 2: Deduplication Strategies

### 1. URL Normalization

```typescript
normalizeUrl(url: string): string {
  const parsed = new URL(url);
  // Remove tracking parameters
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];
  trackingParams.forEach(param => parsed.searchParams.delete(param));
  // Normalize protocol and trailing slashes
  return parsed.toString().replace(/\/$/, '').toLowerCase();
}
```

### 2. Content Fingerprinting

```typescript
generateFingerprint(content: string): string {
  // Remove whitespace and normalize
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  // Generate hash
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

### 3. Similarity Detection

```typescript
async checkSimilarity(newContent: string, threshold = 0.85): Promise<boolean> {
  const fingerprint = this.generateFingerprint(newContent);
  const existing = await this.findByFingerprint(fingerprint);

  if (existing) return true;

  // Check fuzzy similarity for near-duplicates
  const similar = await this.findSimilarContent(newContent, threshold);
  return similar.length > 0;
}
```

### 4. Pre-Insert Check

```typescript
async createIfNotExists(data: RawDataInput): Promise<RawDataRecord | null> {
  const fingerprint = this.generateFingerprint(data.content);
  const normalizedUrl = this.normalizeUrl(data.originalUrl);

  // Check both URL and content fingerprint
  const existing = await this.rawDataModel.findOne({
    $or: [
      { normalizedUrl },
      { fingerprint }
    ]
  });

  if (existing) {
    this.logger.debug(`Duplicate detected: ${data.originalUrl}`);
    return null;
  }

  return this.rawDataModel.create({
    ...data,
    normalizedUrl,
    fingerprint,
  });
}
```

---

## Part 3: Data Quality Management

### Quality Dimensions

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Quality Framework                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │Completeness│  │ Accuracy  │  │Consistency│  │ Timeliness│    │
│  │  数据完整  │  │  数据准确  │  │  数据一致  │  │  数据时效  │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Completeness Validation

```typescript
interface CompletenessCheck {
  entity: string;
  requiredFields: string[];
  threshold: number; // 0-1, e.g., 0.95 = 95% complete
}

const resourceCompletenessChecks: CompletenessCheck[] = [
  {
    entity: 'Resource',
    requiredFields: ['title', 'content', 'type', 'sourceUrl'],
    threshold: 0.99,
  },
];
```

### Accuracy Validation

```typescript
interface AccuracyCheck {
  field: string;
  validationRule: (value: unknown) => boolean;
  errorMessage: string;
}

const urlAccuracyCheck: AccuracyCheck = {
  field: 'sourceUrl',
  validationRule: (url) => {
    if (typeof url !== 'string') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  errorMessage: 'Invalid URL format',
};
```

### Consistency Validation

```typescript
// Cross-database consistency checks
interface ConsistencyCheck {
  sourceTable: string;
  targetTable: string;
  sourceField: string;
  targetField: string;
}

const consistencyChecks: ConsistencyCheck[] = [
  {
    sourceTable: 'Resource',
    targetTable: 'User',
    sourceField: 'userId',
    targetField: 'id',
  },
];
```

### Timeliness Validation

```typescript
interface TimelinessCheck {
  entity: string;
  maxAge: number; // in hours
  timestampField: string;
}

const timelinessChecks: TimelinessCheck[] = [
  {
    entity: 'CrawlerJob',
    maxAge: 24,
    timestampField: 'lastRunAt',
  },
];
```

---

## Part 4: Anomaly Detection

```typescript
interface AnomalyDetector {
  metric: string;
  baseline: number;
  threshold: number; // Percentage deviation allowed
  alertLevel: 'warning' | 'critical';
}

const anomalyDetectors: AnomalyDetector[] = [
  {
    metric: 'daily_resource_count',
    baseline: 100,
    threshold: 0.5, // 50% deviation
    alertLevel: 'warning',
  },
  {
    metric: 'error_rate',
    baseline: 0.01,
    threshold: 5, // 5x increase
    alertLevel: 'critical',
  },
];
```

---

## Part 5: Quality Metrics Dashboard

```typescript
interface DataQualityMetrics {
  // Completeness
  completenessScore: number; // 0-100%
  missingFieldsCount: number;

  // Accuracy
  accuracyScore: number; // 0-100%
  invalidRecordsCount: number;

  // Consistency
  consistencyScore: number; // 0-100%
  orphanedRecordsCount: number;

  // Timeliness
  freshnessScore: number; // 0-100%
  staleRecordsCount: number;

  // Overall
  overallScore: number; // Weighted average
  lastCheckedAt: Date;
}
```

### Quality Report Generation

```typescript
async generateQualityReport(sourceId: string): Promise<DataQualityReport> {
  const rawData = await this.getRawDataBySource(sourceId);

  return {
    totalRecords: rawData.length,
    validRecords: rawData.filter(r => this.isValid(r)).length,
    duplicates: await this.countDuplicates(rawData),
    missingFields: this.analyzeMissingFields(rawData),
    invalidUrls: rawData.filter(r => !this.isValidUrl(r.url)).length,
    orphanedRawData: await this.countOrphanedRecords(rawData),
  };
}
```

---

## Part 6: Data Cleanup Strategies

### Remove Invalid Records

```typescript
async cleanupInvalidRecords() {
  // Soft delete invalid records
  await prisma.resource.updateMany({
    where: {
      sourceUrl: { not: { startsWith: 'http' } },
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      metadata: { invalid: true, reason: 'invalid_url' },
    },
  });
}
```

### Archive Stale Data

```typescript
async archiveStaleData(daysOld: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const staleRecords = await prisma.resource.findMany({
    where: {
      updatedAt: { lt: cutoffDate },
      status: 'ARCHIVED',
    },
  });

  await archiveService.moveToArchive(staleRecords);
}
```

---

## Scheduled Jobs

```typescript
const qualityJobs = [
  {
    name: 'daily-quality-check',
    schedule: '0 2 * * *', // 2 AM daily
    task: 'runFullQualityAudit',
  },
  {
    name: 'hourly-anomaly-detection',
    schedule: '0 * * * *', // Every hour
    task: 'detectAnomalies',
  },
  {
    name: 'weekly-cleanup',
    schedule: '0 3 * * 0', // Sunday 3 AM
    task: 'cleanupInvalidData',
  },
];
```

---

## Command Reference

```bash
# Data collection
npm run collect:hackernews     # Fetch from HackerNews
npm run collect:rss            # Fetch from RSS feeds
npm run collect:all            # Run all collectors

# Data quality
npm run data-quality:audit     # Full audit
npm run data-quality:report    # Generate report
npm run data-quality:cleanup   # Run cleanup
npm run data-quality:monitor   # Start monitoring

# Individual checks
npm run data-quality:completeness
npm run data-quality:accuracy
npm run data-quality:consistency
npm run data-quality:freshness
```

---

## Your Responsibilities

1. **Design robust data collection pipelines**
2. **Implement effective deduplication strategies**
3. **Ensure data quality and completeness**
4. **Maintain bi-directional references** between raw data and resources
5. **Monitor data quality metrics** continuously
6. **Detect anomalies** in data patterns
7. **Run quality audits** on schedule
8. **Implement cleanup** procedures
9. **Handle errors gracefully** with retry logic
