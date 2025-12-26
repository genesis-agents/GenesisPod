'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { Locale, I18nContextValue, Translations } from './types';

// Import translations statically for better performance
import en from './locales/en.json';
import zh from './locales/zh.json';

const translations: Record<Locale, Translations> = { en, zh };

const STORAGE_KEY = 'deepdive-locale';
const DEFAULT_LOCALE: Locale = 'en';

// Create context with default values
const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: string) => key,
  isLoading: true,
});

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue({ a: { b: 'hello' } }, 'a.b') => 'hello'
 */
function getNestedValue(obj: Translations, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace template variables in string
 * e.g., interpolate('Hello {{name}}', { name: 'World' }) => 'Hello World'
 */
function interpolate(
  str: string,
  params?: Record<string, string | number>
): string {
  if (!params) return str;

  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key]?.toString() ?? `{{${key}}}`;
  });
}

/**
 * Detect user's preferred locale from browser settings
 */
function detectBrowserLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const browserLang = navigator.language.toLowerCase();

  // Check for Chinese variants
  if (browserLang.startsWith('zh')) {
    return 'zh';
  }

  // Default to English for all other languages
  return 'en';
}

/**
 * I18n Provider Component
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize locale from storage or browser settings
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && (stored === 'en' || stored === 'zh')) {
      setLocaleState(stored);
    } else {
      const detected = detectBrowserLocale();
      setLocaleState(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
    setIsLoading(false);
  }, []);

  // Update locale and persist to storage
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);

    // Update html lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const translation = getNestedValue(translations[locale], key);

      if (translation === undefined) {
        // Fallback to English if translation not found
        const fallback = getNestedValue(translations.en, key);
        if (fallback !== undefined) {
          return interpolate(fallback, params);
        }
        // Return key if no translation found (helps identify missing translations)
        console.warn(`[i18n] Missing translation for key: ${key}`);
        return key;
      }

      return interpolate(translation, params);
    },
    [locale]
  );

  // Update document lang attribute when locale changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      isLoading,
    }),
    [locale, setLocale, t, isLoading]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access i18n context
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook for translations (alias for useI18n with just translation function)
 */
export function useTranslation() {
  return useI18n();
}
