/**
 * AI Slides V5.0 - AI Edit Hook
 *
 * Hook for AI-powered editing capabilities:
 * - Fix Layout
 * - Polish Content
 * - Fact Check
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/utils/logger';

// ============================================
// Types
// ============================================

export type AIEditAction = 'fix-layout' | 'polish-content' | 'fact-check';

export interface FixLayoutResult {
  success: boolean;
  originalHtml: string;
  fixedHtml: string;
  issuesFound: number;
  issuesFixed: number;
  criticalIssues: number;
}

export interface PolishContentResult {
  success: boolean;
  pagesPolished: number;
  totalChanges: number;
  pages: Array<{
    index: number;
    title: string;
    content: string;
  }>;
}

export interface FactCheckResult {
  success: boolean;
  totalClaims: number;
  verifiedCount: number;
  disputedCount: number;
  needsCitationCount: number;
  overallCredibility: number;
  pageResults: Array<{
    pageIndex: number;
    overallScore: number;
    credibilityLevel: string;
    claimsCount: number;
  }>;
}

export interface PolishOptions {
  styleGuide?: {
    terminology?: string;
    sentenceStyle?: string;
    forbiddenWords?: string[];
  };
  targetTone?: 'formal' | 'casual' | 'technical' | 'friendly';
  language?: 'zh' | 'en';
}

// ============================================
// Hook
// ============================================

export function useAIEdit() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fix layout issues on a specific page
   */
  const fixLayout = useCallback(
    async (
      missionId: string,
      pageIndex: number
    ): Promise<FixLayoutResult | null> => {
      if (!user?.id) {
        setError('User not authenticated');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/ai-office/slides/edit/fix-layout/${missionId}/${pageIndex}?userId=${user.id}`,
          { method: 'POST' }
        );

        if (!response.ok) {
          throw new Error('Failed to fix layout');
        }

        const result = await response.json();
        return result.data as FixLayoutResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Fix layout failed';
        logger.error('[useAIEdit] fixLayout error:', err);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  /**
   * Polish content for all pages
   */
  const polishContent = useCallback(
    async (
      missionId: string,
      options: PolishOptions = {}
    ): Promise<PolishContentResult | null> => {
      if (!user?.id) {
        setError('User not authenticated');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/ai-office/slides/edit/polish/${missionId}?userId=${user.id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to polish content');
        }

        const result = await response.json();
        return result.data as PolishContentResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Polish content failed';
        logger.error('[useAIEdit] polishContent error:', err);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  /**
   * Fact check all pages
   */
  const factCheck = useCallback(
    async (
      missionId: string,
      strictMode: boolean = false
    ): Promise<FactCheckResult | null> => {
      if (!user?.id) {
        setError('User not authenticated');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/ai-office/slides/edit/fact-check/${missionId}?userId=${user.id}&strictMode=${strictMode}`,
          { method: 'POST' }
        );

        if (!response.ok) {
          throw new Error('Failed to fact check');
        }

        const result = await response.json();
        return result.data as FactCheckResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Fact check failed';
        logger.error('[useAIEdit] factCheck error:', err);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  /**
   * Execute AI edit action
   */
  const executeAction = useCallback(
    async (
      action: AIEditAction,
      missionId: string,
      pageIndex?: number,
      options?: PolishOptions
    ) => {
      switch (action) {
        case 'fix-layout':
          if (pageIndex === undefined) {
            setError('Page index is required for fix-layout');
            return null;
          }
          return fixLayout(missionId, pageIndex);
        case 'polish-content':
          return polishContent(missionId, options);
        case 'fact-check':
          return factCheck(missionId);
        default:
          setError(`Unknown action: ${action}`);
          return null;
      }
    },
    [fixLayout, polishContent, factCheck]
  );

  return {
    loading,
    error,
    fixLayout,
    polishContent,
    factCheck,
    executeAction,
  };
}
