'use client';

import { create } from 'zustand';
import {
  SocialContentType,
  SocialContentSourceType,
} from '@/hooks/domain/useAISocial';

export type CreateStep = 1 | 2 | 3 | 4;

interface SocialCreateState {
  // 步骤状态
  currentStep: CreateStep;

  // Step 1: 来源
  sourceType: SocialContentSourceType | null;
  sourceId: string | null;
  sourceTitle: string | null;
  externalUrl: string;

  // Step 2: 平台
  platform: SocialContentType | null;

  // Step 3: 账户
  connectionId: string | null;
  connectionName: string | null;
  skipAccount: boolean;

  // Step 4: 内容
  title: string;
  content: string;
  digest: string;
  tags: string[];
  coverImage: string;

  // 状态
  isProcessing: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  currentContentId: string | null;

  // Actions
  setStep: (step: CreateStep) => void;
  setSource: (
    type: SocialContentSourceType | null,
    id?: string | null,
    title?: string | null
  ) => void;
  setExternalUrl: (url: string) => void;
  setPlatform: (platform: SocialContentType | null) => void;
  setConnection: (id: string | null, name: string | null) => void;
  setSkipAccount: (skip: boolean) => void;
  setTitle: (title: string) => void;
  setContentText: (content: string) => void;
  setDigest: (digest: string) => void;
  setTags: (tags: string[]) => void;
  setCoverImage: (coverImage: string) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  setIsPublishing: (isPublishing: boolean) => void;
  setCurrentContentId: (id: string | null) => void;
  setContentFromAI: (data: {
    title: string;
    content: string;
    digest?: string;
    tags?: string[];
    contentId?: string;
  }) => void;
  reset: () => void;
  canGoToStep: (step: CreateStep) => boolean;
}

const initialState = {
  currentStep: 1 as CreateStep,
  sourceType: null,
  sourceId: null,
  sourceTitle: null,
  externalUrl: '',
  platform: null,
  connectionId: null,
  connectionName: null,
  skipAccount: false,
  title: '',
  content: '',
  digest: '',
  tags: [] as string[],
  coverImage: '',
  isProcessing: false,
  isSaving: false,
  isPublishing: false,
  currentContentId: null,
};

export const useSocialCreateStore = create<SocialCreateState>((set, get) => ({
  ...initialState,

  setStep: (step) => {
    const state = get();
    if (state.canGoToStep(step)) {
      set({ currentStep: step });
    }
  },

  setSource: (type, id = null, title = null) =>
    set({
      sourceType: type,
      sourceId: id,
      sourceTitle: title,
      // Reset downstream selections when source changes
      platform: null,
      connectionId: null,
      connectionName: null,
      skipAccount: false,
    }),

  setExternalUrl: (url) => set({ externalUrl: url }),

  setPlatform: (platform) =>
    set({
      platform,
      // Reset account when platform changes
      connectionId: null,
      connectionName: null,
      skipAccount: false,
    }),

  setConnection: (id, name) => set({ connectionId: id, connectionName: name }),

  setSkipAccount: (skip) => set({ skipAccount: skip }),

  setTitle: (title) => set({ title }),

  setContentText: (content) => set({ content }),

  setDigest: (digest) => set({ digest }),

  setTags: (tags) => set({ tags }),

  setCoverImage: (coverImage) => set({ coverImage }),

  setIsProcessing: (isProcessing) => set({ isProcessing }),

  setIsSaving: (isSaving) => set({ isSaving }),

  setIsPublishing: (isPublishing) => set({ isPublishing }),

  setCurrentContentId: (id) => set({ currentContentId: id }),

  setContentFromAI: (data) =>
    set({
      title: data.title,
      content: data.content,
      digest: data.digest || '',
      tags: data.tags || [],
      currentContentId: data.contentId || null,
    }),

  reset: () => set(initialState),

  canGoToStep: (step) => {
    const state = get();
    switch (step) {
      case 1:
        return true;
      case 2:
        // Need source selected (except MANUAL which can go directly)
        return (
          state.sourceType === 'MANUAL' ||
          (state.sourceType === 'EXTERNAL_URL' &&
            state.externalUrl.trim() !== '') ||
          (state.sourceType !== null && state.sourceId !== null)
        );
      case 3:
        // Need platform selected
        return state.platform !== null && state.canGoToStep(2);
      case 4:
        // Need account selected or skipped
        return (
          (state.connectionId !== null || state.skipAccount) &&
          state.canGoToStep(3)
        );
      default:
        return false;
    }
  },
}));
