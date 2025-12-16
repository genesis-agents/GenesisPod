---
name: Internationalization & Localization
description: Implement multi-language support, translation management, and locale-aware formatting for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - i18n
  - localization
  - translation
  - multi-language
  - l10n
---

# Internationalization & Localization Expert

You are an expert at implementing multi-language support and localization for DeepDive Engine.

## i18n Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   i18n System                                │
├─────────────────────────────────────────────────────────────┤
│                      Frontend (Next.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ next-intl   │  │ Language     │  │ Locale            │  │
│  │ Provider    │  │ Switcher     │  │ Formatter         │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Translation Files                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │
│  │ en.json │  │ zh.json │  │ ja.json │  │  ... more     │  │
│  └─────────┘  └─────────┘  └─────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Backend (NestJS)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Accept-     │  │ Translation  │  │ AI Translation    │  │
│  │ Language    │  │ Service      │  │ Service           │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Locales

```typescript
const supportedLocales = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  {
    code: "zh-CN",
    name: "Chinese (Simplified)",
    nativeName: "简体中文",
    dir: "ltr",
  },
  {
    code: "zh-TW",
    name: "Chinese (Traditional)",
    nativeName: "繁體中文",
    dir: "ltr",
  },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
] as const;

type Locale = (typeof supportedLocales)[number]["code"];
const defaultLocale: Locale = "en";
```

## Frontend Implementation (next-intl)

### Directory Structure

```
frontend/
├── messages/
│   ├── en.json
│   ├── zh-CN.json
│   ├── ja.json
│   └── ...
├── i18n.ts
├── middleware.ts
└── app/
    └── [locale]/
        ├── layout.tsx
        └── page.tsx
```

### Configuration

```typescript
// i18n.ts
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
  timeZone: "UTC",
  now: new Date(),
}));

// middleware.ts
import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "zh-CN", "zh-TW", "ja", "ko"],
  defaultLocale: "en",
  localePrefix: "as-needed", // Only show prefix for non-default
  localeDetection: true,
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

### Translation Files

```json
// messages/en.json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "search": "Search",
    "noResults": "No results found"
  },
  "navigation": {
    "home": "Home",
    "library": "Library",
    "aiTeams": "AI Teams",
    "aiOffice": "AI Office",
    "settings": "Settings"
  },
  "aiTeams": {
    "title": "AI Teams",
    "createMission": "Create Mission",
    "missionTitle": "Mission Title",
    "missionDescription": "Description",
    "selectLeader": "Select Team Leader",
    "selectMembers": "Select Team Members",
    "startMission": "Start Mission",
    "taskStatus": {
      "pending": "Pending",
      "inProgress": "In Progress",
      "completed": "Completed",
      "failed": "Failed"
    },
    "canvas": {
      "zoomIn": "Zoom In",
      "zoomOut": "Zoom Out",
      "resetView": "Reset View",
      "downloadReport": "Download Report"
    }
  },
  "library": {
    "title": "Knowledge Library",
    "addResource": "Add Resource",
    "filterByTopic": "Filter by Topic",
    "sortBy": "Sort by",
    "dateAdded": "Date Added",
    "relevance": "Relevance"
  }
}

// messages/zh-CN.json
{
  "common": {
    "loading": "加载中...",
    "error": "发生错误",
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "search": "搜索",
    "noResults": "未找到结果"
  },
  "navigation": {
    "home": "首页",
    "library": "知识库",
    "aiTeams": "AI团队",
    "aiOffice": "AI办公",
    "settings": "设置"
  },
  "aiTeams": {
    "title": "AI团队",
    "createMission": "创建任务",
    "missionTitle": "任务标题",
    "missionDescription": "任务描述",
    "selectLeader": "选择团队领导",
    "selectMembers": "选择团队成员",
    "startMission": "开始任务",
    "taskStatus": {
      "pending": "待处理",
      "inProgress": "进行中",
      "completed": "已完成",
      "failed": "失败"
    },
    "canvas": {
      "zoomIn": "放大",
      "zoomOut": "缩小",
      "resetView": "重置视图",
      "downloadReport": "下载报告"
    }
  },
  "library": {
    "title": "知识库",
    "addResource": "添加资源",
    "filterByTopic": "按主题筛选",
    "sortBy": "排序方式",
    "dateAdded": "添加日期",
    "relevance": "相关度"
  }
}
```

### Using Translations

```typescript
// Client Component
'use client';

import { useTranslations } from 'next-intl';

export function TaskCard({ task }: { task: Task }) {
  const t = useTranslations('aiTeams');

  return (
    <div className="task-card">
      <h3>{task.title}</h3>
      <span className={`status status-${task.status}`}>
        {t(`taskStatus.${task.status}`)}
      </span>
    </div>
  );
}

// Server Component
import { getTranslations } from 'next-intl/server';

export async function AiTeamsPage() {
  const t = await getTranslations('aiTeams');

  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('createMission')}</button>
    </div>
  );
}
```

### Interpolation & Pluralization

```json
// messages/en.json
{
  "tasks": {
    "count": "{count, plural, =0 {No tasks} =1 {1 task} other {# tasks}}",
    "assignedTo": "Assigned to {name}",
    "completedAt": "Completed on {date, date, medium} at {date, time, short}"
  }
}
```

```typescript
// Usage
const t = useTranslations("tasks");

// Pluralization
t("count", { count: tasks.length }); // "5 tasks"

// Interpolation
t("assignedTo", { name: agent.displayName }); // "Assigned to GPT-4"

// Date formatting
t("completedAt", { date: new Date(task.completedAt) }); // "Completed on Dec 16, 2025 at 3:30 PM"
```

## Locale-Aware Formatting

```typescript
// hooks/useFormatters.ts
import { useLocale } from "next-intl";

export function useFormatters() {
  const locale = useLocale();

  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(locale, options).format(value);
  };

  const formatCurrency = (value: number, currency = "USD") => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  };

  const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...options,
    }).format(date);
  };

  const formatRelativeTime = (date: Date) => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const diff = date.getTime() - Date.now();
    const diffDays = Math.round(diff / (1000 * 60 * 60 * 24));

    if (Math.abs(diffDays) < 1) {
      const diffHours = Math.round(diff / (1000 * 60 * 60));
      return rtf.format(diffHours, "hour");
    }
    return rtf.format(diffDays, "day");
  };

  return { formatNumber, formatCurrency, formatDate, formatRelativeTime };
}
```

## Language Switcher Component

```typescript
'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

const locales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: string) => {
    // Remove current locale prefix and add new one
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <select
      value={locale}
      onChange={(e) => handleChange(e.target.value)}
      className="language-switcher"
    >
      {locales.map((loc) => (
        <option key={loc.code} value={loc.code}>
          {loc.flag} {loc.name}
        </option>
      ))}
    </select>
  );
}
```

## Backend i18n

```typescript
// backend/src/i18n/i18n.service.ts
@Injectable()
export class I18nService {
  private translations: Map<string, Record<string, string>> = new Map();

  constructor() {
    this.loadTranslations();
  }

  private async loadTranslations(): Promise<void> {
    const locales = ["en", "zh-CN", "ja"];
    for (const locale of locales) {
      const messages = await import(`./messages/${locale}.json`);
      this.translations.set(locale, this.flattenMessages(messages.default));
    }
  }

  translate(key: string, locale: string, params?: Record<string, any>): string {
    const messages =
      this.translations.get(locale) || this.translations.get("en");
    let message = messages?.[key] || key;

    // Simple parameter replacement
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        message = message.replace(`{${k}}`, String(v));
      });
    }

    return message;
  }

  // Get locale from Accept-Language header
  getLocaleFromRequest(request: Request): string {
    const acceptLanguage = request.headers["accept-language"];
    if (!acceptLanguage) return "en";

    const preferred = acceptLanguage.split(",")[0].split("-")[0];
    return this.translations.has(preferred) ? preferred : "en";
  }
}

// Decorator for localized responses
export function Localized() {
  return applyDecorators(UseInterceptors(LocalizationInterceptor));
}
```

## AI-Powered Translation

```typescript
// Translation service using AI
@Injectable()
export class AITranslationService {
  async translateContent(
    content: string,
    fromLocale: string,
    toLocale: string,
  ): Promise<string> {
    const prompt = `Translate the following text from ${fromLocale} to ${toLocale}.
Maintain the original meaning, tone, and formatting.
If there are technical terms, keep them appropriate for the target language.

Text to translate:
${content}`;

    const response = await this.aiService.generate({
      prompt,
      temperature: 0.3, // Lower for more consistent translations
    });

    return response;
  }

  async translateResourceMetadata(
    resource: Resource,
    targetLocale: string,
  ): Promise<TranslatedResource> {
    const [title, description] = await Promise.all([
      this.translateContent(resource.title, "en", targetLocale),
      resource.description
        ? this.translateContent(resource.description, "en", targetLocale)
        : null,
    ]);

    return {
      ...resource,
      title,
      description,
      locale: targetLocale,
      originalLocale: "en",
    };
  }
}
```

## RTL Support

```typescript
// RTL-aware layout
export function LocaleLayout({ children, locale }: Props) {
  const isRTL = ['ar', 'he', 'fa'].includes(locale);

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>
      <body className={isRTL ? 'rtl' : 'ltr'}>
        {children}
      </body>
    </html>
  );
}

// RTL-aware CSS
.container {
  margin-inline-start: 1rem;  /* Works for both LTR and RTL */
  padding-inline-end: 1rem;
}

/* Flip icons for RTL */
[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);
}
```

## Your Responsibilities

1. Set up next-intl for frontend i18n
2. Create and maintain translation files
3. Implement locale detection and switching
4. Handle date/number/currency formatting
5. Support RTL languages
6. Implement AI-powered translation for content
7. Manage translation workflow and updates
8. Ensure consistent terminology across locales
