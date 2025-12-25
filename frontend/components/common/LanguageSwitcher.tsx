'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation, type Locale } from '@/lib/i18n';

interface LanguageOption {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
];

interface LanguageSwitcherProps {
  variant?: 'icon' | 'full' | 'compact' | 'sidebar';
  className?: string;
}

export default function LanguageSwitcher({
  variant = 'icon',
  className = '',
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLanguage = languages.find((l) => l.code === locale);

  const handleSelect = (code: Locale) => {
    setLocale(code);
    setIsOpen(false);
  };

  // Sidebar variant - matches sidebar navigation item style
  if (variant === 'sidebar') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          title={t('profile.language')}
        >
          <Globe className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1 text-left">
            {currentLanguage?.nativeName}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                  locale === lang.code
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="flex-1 text-left font-medium">
                  {lang.nativeName}
                </span>
                {locale === lang.code && (
                  <Check className="h-4 w-4 text-violet-600" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Icon only variant (for collapsed sidebar)
  if (variant === 'icon') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          title={t('profile.language')}
          aria-label={t('profile.language')}
        >
          <Globe className="h-5 w-5" />
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-1/2 z-50 mb-2 w-36 -translate-x-1/2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  locale === lang.code
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="flex-1">{lang.nativeName}</span>
                {locale === lang.code && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Compact variant (shows current language abbreviation)
  if (variant === 'compact') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Globe className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1 text-left">
            {currentLanguage?.nativeName}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                  locale === lang.code
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="flex-1 text-left font-medium">
                  {lang.nativeName}
                </span>
                {locale === lang.code && (
                  <Check className="h-4 w-4 text-violet-600" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full variant (shows language name with border - for forms/settings)
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <span className="text-base">{currentLanguage?.flag}</span>
        <span>{currentLanguage?.nativeName}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                locale === lang.code
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <div className="flex flex-col items-start">
                <span className="font-medium">{lang.nativeName}</span>
                <span className="text-xs text-gray-500">{lang.name}</span>
              </div>
              {locale === lang.code && (
                <Check className="ml-auto h-4 w-4 text-violet-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
