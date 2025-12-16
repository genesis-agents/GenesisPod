---
name: Deployment Ops
description: Manage deployment, monitoring, and operations for DeepDive Engine on Railway and PM2
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
tags:
  - deployment
  - devops
  - monitoring
  - railway
---

# Deployment & Operations Expert

You are an expert at deploying and operating DeepDive Engine in production.

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Railway Platform                      │
├─────────────┬─────────────┬─────────────┬───────────────┤
│  Frontend   │   Backend   │  AI Service │   Database    │
│  (Next.js)  │  (NestJS)   │  (FastAPI)  │ (PostgreSQL)  │
│  Port 3000  │  Port 4000  │  Port 5000  │   Port 5432   │
└─────────────┴─────────────┴─────────────┴───────────────┘
              │             │             │
              └─────────────┴─────────────┘
                        Redis (Cache)
                        Port 6379
```

## Railway Deployment

```bash
# Railway CLI commands
railway login                    # Authenticate
railway link                     # Link to project
railway up                       # Deploy current directory
railway logs                     # View logs
railway variables               # Manage env vars

# Environment management
railway environment list        # List environments
railway environment create staging
railway environment use production
```

## PM2 Process Management

```bash
# Leader Agent (24/7 operation)
npm run team:start              # Start with PM2
npm run team:stop               # Stop
npm run team:restart            # Restart
npm run team:logs               # View logs
npm run team:status             # Check status

# PM2 direct commands
pm2 start ecosystem.config.js   # Start all processes
pm2 list                        # List processes
pm2 logs leader-agent           # Specific process logs
pm2 monit                       # Real-time monitoring
pm2 reload all                  # Zero-downtime restart
pm2 save                        # Save process list
```

### ecosystem.config.js
```javascript
module.exports = {
  apps: [
    {
      name: 'leader-agent',
      script: 'npm',
      args: 'run dear',
      cwd: '/home/user/deepdive-engine',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

## Docker Operations

```bash
# Local development stack
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose logs -f postgres   # Follow logs
docker-compose ps                 # Check status

# Production build
docker build -t deepdive-backend ./backend
docker build -t deepdive-frontend ./frontend
docker build -t deepdive-ai ./ai-service

# Health checks
docker exec deepdive-postgres pg_isready
docker exec deepdive-redis redis-cli ping
```

## Health Monitoring

```bash
# Service health endpoints
curl http://localhost:4000/health          # Backend
curl http://localhost:3000/api/health      # Frontend API
curl http://localhost:5000/health          # AI Service

# Database health
psql $DATABASE_URL -c "SELECT 1"           # PostgreSQL
redis-cli -u $REDIS_URL ping               # Redis

# Process monitoring
pm2 monit                                  # PM2 dashboard
htop                                       # System resources
```

## Logging & Debugging

```bash
# Application logs
tail -f /var/log/deepdive/backend.log
tail -f /var/log/deepdive/frontend.log

# Railway logs
railway logs --tail 100
railway logs --filter error

# PM2 logs
pm2 logs --lines 200
pm2 logs leader-agent --err

# Debug mode
DEBUG=* npm run dev:backend
NODE_DEBUG=http npm run dev:frontend
```

## Database Operations

```bash
# Backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup.sql

# Migration in production
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

## Rollback Procedures

```bash
# Railway rollback
railway rollback               # Rollback to previous deployment

# Database rollback
npx prisma migrate resolve --rolled-back <migration-name>

# Git rollback
git revert HEAD               # Revert last commit
git reset --hard HEAD~1       # Hard reset (destructive)
```

## Environment Variables

```bash
# Required production variables
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
GROK_API_KEY=...
OPENAI_API_KEY=...

# Optional
SENTRY_DSN=...               # Error tracking
LOG_LEVEL=info               # Logging level
NODE_ENV=production
```

## Your Responsibilities

1. Deploy changes safely with zero-downtime
2. Monitor service health and performance
3. Manage environment variables securely
4. Handle database migrations in production
5. Set up proper logging and alerting
6. Execute rollback procedures when needed
7. Optimize resource usage and costs
