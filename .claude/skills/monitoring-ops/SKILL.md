---
name: Monitoring & Operations
description: Implement logging, monitoring, alerting, health checks, and operational dashboards for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - monitoring
  - logging
  - alerting
  - health-check
  - observability
---

# Monitoring & Operations Expert

You are an expert at implementing monitoring, logging, and operational excellence for DeepDive Engine.

## Observability Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Observability Stack                         │
├─────────────────────────────────────────────────────────────┤
│                      Data Collection                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Application │  │ System       │  │ Custom            │  │
│  │ Logs        │  │ Metrics      │  │ Events            │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Processing                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Log         │  │ Metric       │  │ Trace             │  │
│  │ Aggregation │  │ Aggregation  │  │ Collection        │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Storage & Analysis                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Elasticsearch│ │ Prometheus   │  │ Jaeger            │  │
│  │ / Loki      │  │ / InfluxDB   │  │ / Zipkin          │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Visualization & Alerting                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Grafana     │  │ Alert        │  │ Status            │  │
│  │ Dashboards  │  │ Manager      │  │ Page              │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

```
.claude/orchestrator/
├── leader-state.json           # Leader agent state
├── task-queue.json             # Task queue state
└── logs/
    └── *.log                   # Agent logs

backend/src/common/
├── logging/
│   ├── logger.service.ts       # Structured logging
│   └── logger.middleware.ts    # Request logging
├── health/
│   ├── health.controller.ts    # Health endpoints
│   └── health.service.ts       # Health checks
└── metrics/
    ├── metrics.service.ts      # Metrics collection
    └── metrics.controller.ts   # Metrics endpoint
```

## Structured Logging

```typescript
// logger.service.ts
import { Injectable, LogLevel } from "@nestjs/common";
import * as winston from "winston";

interface LogContext {
  requestId?: string;
  userId?: string;
  service?: string;
  action?: string;
  duration?: number;
  [key: string]: any;
}

@Injectable()
export class LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: "deepdive-engine",
        environment: process.env.NODE_ENV,
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: "logs/combined.log",
          maxsize: 10485760,
          maxFiles: 10,
        }),
      ],
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error(message, {
      ...context,
      error: error?.message,
      stack: error?.stack,
    });
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }
}

// Request logging middleware
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = crypto.randomUUID();
    const start = Date.now();

    // Attach request ID
    req["requestId"] = requestId;
    res.setHeader("X-Request-ID", requestId);

    // Log on response finish
    res.on("finish", () => {
      const duration = Date.now() - start;

      this.logger.info("HTTP Request", {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
        userId: req["user"]?.id,
      });

      // Alert on slow requests
      if (duration > 5000) {
        this.logger.warn("Slow request detected", {
          requestId,
          url: req.url,
          duration,
        });
      }
    });

    next();
  }
}
```

## Health Checks

```typescript
// health.controller.ts
@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private redis: RedisHealthIndicator,
    private mongo: MongoHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database checks
      () => this.db.pingCheck("database"),
      () => this.mongo.pingCheck("mongodb"),
      () => this.redis.pingCheck("redis"),

      // Memory check
      () => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024), // 300MB
      () => this.memory.checkRSS("memory_rss", 500 * 1024 * 1024), // 500MB

      // Disk check
      () =>
        this.disk.checkStorage("disk", {
          path: "/",
          thresholdPercent: 0.9, // 90%
        }),
    ]);
  }

  @Get("ready")
  readiness() {
    return { status: "ready", timestamp: new Date().toISOString() };
  }

  @Get("live")
  liveness() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }
}

// Health check response format
interface HealthCheckResult {
  status: "ok" | "error";
  info?: Record<string, HealthIndicatorResult>;
  error?: Record<string, HealthIndicatorResult>;
  details: Record<string, HealthIndicatorResult>;
}
```

## Metrics Collection

```typescript
// metrics.service.ts
import { Injectable } from "@nestjs/common";
import * as client from "prom-client";

@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: client.Histogram<string>;
  private readonly httpRequestTotal: client.Counter<string>;
  private readonly activeConnections: client.Gauge<string>;
  private readonly aiRequestDuration: client.Histogram<string>;
  private readonly taskQueueSize: client.Gauge<string>;

  constructor() {
    // Enable default metrics
    client.collectDefaultMetrics({ prefix: "deepdive_" });

    // HTTP metrics
    this.httpRequestDuration = new client.Histogram({
      name: "deepdive_http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    this.httpRequestTotal = new client.Counter({
      name: "deepdive_http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
    });

    this.activeConnections = new client.Gauge({
      name: "deepdive_active_connections",
      help: "Number of active connections",
    });

    // AI metrics
    this.aiRequestDuration = new client.Histogram({
      name: "deepdive_ai_request_duration_seconds",
      help: "Duration of AI provider requests",
      labelNames: ["provider", "model", "status"],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
    });

    // Task queue metrics
    this.taskQueueSize = new client.Gauge({
      name: "deepdive_task_queue_size",
      help: "Number of tasks in queue",
      labelNames: ["status"],
    });
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration,
    );
    this.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordAiRequest(
    provider: string,
    model: string,
    status: string,
    duration: number,
  ): void {
    this.aiRequestDuration.observe({ provider, model, status }, duration);
  }

  setTaskQueueSize(status: string, size: number): void {
    this.taskQueueSize.set({ status }, size);
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}

// Metrics controller
@Controller("metrics")
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    res.set("Content-Type", client.register.contentType);
    res.send(await this.metricsService.getMetrics());
  }
}
```

## Alerting Configuration

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  slack_api_url: "${SLACK_WEBHOOK_URL}"

route:
  receiver: "default"
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: "critical-alerts"
      continue: true
    - match:
        severity: warning
      receiver: "warning-alerts"

receivers:
  - name: "default"
    slack_configs:
      - channel: "#alerts"
        title: "{{ .GroupLabels.alertname }}"
        text: "{{ range .Alerts }}{{ .Annotations.description }}{{ end }}"

  - name: "critical-alerts"
    slack_configs:
      - channel: "#alerts-critical"
        title: ":fire: CRITICAL: {{ .GroupLabels.alertname }}"
        text: "{{ range .Alerts }}{{ .Annotations.description }}{{ end }}"

  - name: "warning-alerts"
    slack_configs:
      - channel: "#alerts"
        title: ":warning: {{ .GroupLabels.alertname }}"
        text: "{{ range .Alerts }}{{ .Annotations.description }}{{ end }}"
```

```yaml
# prometheus-rules.yml
groups:
  - name: deepdive-alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(deepdive_http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      # Slow responses
      - alert: SlowResponses
        expr: histogram_quantile(0.95, rate(deepdive_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response times"
          description: "95th percentile latency is {{ $value }}s"

      # High memory usage
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 500
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}MB"

      # Database connection issues
      - alert: DatabaseConnectionFailed
        expr: deepdive_health_check_database != 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection failed"
          description: "Unable to connect to database"

      # AI provider errors
      - alert: AIProviderErrors
        expr: rate(deepdive_ai_request_duration_seconds_count{status="error"}[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI provider errors increasing"
          description: "AI error rate: {{ $value }} errors/sec"
```

## Dashboard Configuration (Grafana)

```json
{
  "dashboard": {
    "title": "DeepDive Engine Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(deepdive_http_requests_total[5m])",
            "legendFormat": "{{ method }} {{ route }}"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(deepdive_http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p95 latency"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "sum(rate(deepdive_http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(deepdive_http_requests_total[5m])) * 100",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "AI Request Duration",
        "type": "heatmap",
        "targets": [
          {
            "expr": "rate(deepdive_ai_request_duration_seconds_bucket[5m])",
            "legendFormat": "{{ provider }}"
          }
        ]
      },
      {
        "title": "Task Queue",
        "type": "gauge",
        "targets": [
          {
            "expr": "deepdive_task_queue_size",
            "legendFormat": "{{ status }}"
          }
        ]
      }
    ]
  }
}
```

## Orchestrator Monitoring

```typescript
// Monitor leader-state.json and task-queue.json
interface LeaderState {
  leader_session_id: string;
  status: 'running' | 'idle' | 'error';
  started_at: string;
  last_heartbeat: string;
  current_cycle: number;
  running_tasks: string[];
  worker_status: Record<string, 'ready' | 'busy' | 'error'>;
  statistics: {
    cycles_completed: number;
    tasks_started: number;
    tasks_completed: number;
    tasks_failed: number;
    total_runtime_seconds: number;
  };
  last_error?: string;
}

// Health check for orchestrator
async checkOrchestratorHealth(): Promise<HealthStatus> {
  const state = await this.readLeaderState();

  const lastHeartbeat = new Date(state.last_heartbeat);
  const heartbeatAge = Date.now() - lastHeartbeat.getTime();

  if (heartbeatAge > 120000) { // 2 minutes
    return {
      status: 'unhealthy',
      reason: `Heartbeat stale: ${heartbeatAge}ms ago`,
    };
  }

  if (state.last_error) {
    return {
      status: 'degraded',
      reason: state.last_error,
    };
  }

  return { status: 'healthy' };
}
```

## Your Responsibilities

1. Implement structured logging with context
2. Set up health check endpoints
3. Configure metrics collection (Prometheus)
4. Design alerting rules and notifications
5. Build monitoring dashboards (Grafana)
6. Monitor orchestrator and agent health
7. Set up log aggregation and analysis
8. Implement distributed tracing
