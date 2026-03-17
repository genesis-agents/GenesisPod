'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { useSocialCreateStore } from '@/stores';
import {
  useSocialContents,
  useSocialPublish,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores';
import { Loader2, AlertCircle } from 'lucide-react';
import { deleteDraft, generateDraftId } from '@/lib/storage/draft-storage';

// Import new components
import { StepNavigation } from '@/components/ai-social/create/StepNavigation';
import { SourceSelector } from '@/components/ai-social/create/SourceSelector';
import { PlatformSelector } from '@/components/ai-social/create/PlatformSelector';
import { AccountSelector } from '@/components/ai-social/create/AccountSelector';
import { ContentEditor } from '@/components/ai-social/create/ContentEditor';
import { SeriesEditor } from '@/components/ai-social/create/SeriesEditor';

function CreateSocialContentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  // Store
  const {
    currentStep,
    sourceType,
    sourceId,
    externalUrl,
    platform,
    connectionId,
    skipAccount,
    title,
    content,
    digest,
    tags,
    currentContentId,
    isSeriesMode,
    seriesParts,
    setSource,
    setExternalUrl,
    setStep,
    setIsSaving,
    setIsPublishing,
    setCurrentContentId,
    reset,
  } = useSocialCreateStore();

  // Hooks
  const { addContent, editContent } = useSocialContents();
  const { publish } = useSocialPublish();

  // URL params for deep linking
  const sourceParam = searchParams?.get('source');
  const urlParam = searchParams?.get('url');
  const sourceIdParam = searchParams?.get('sourceId');

  // Initialize from URL params
  useEffect(() => {
    if (sourceParam) {
      setSource(
        sourceParam as Parameters<typeof setSource>[0],
        sourceIdParam || null,
        null
      );
      if (urlParam) {
        setExternalUrl(urlParam);
      }
      // Skip to step 2 if we have source info
      if (
        sourceParam === 'MANUAL' ||
        (sourceParam === 'EXTERNAL_URL' && urlParam) ||
        sourceIdParam
      ) {
        setStep(2);
      }
    }
  }, [sourceParam, urlParam, sourceIdParam]);

  // Reset on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  // Save draft handler
  const handleSaveDraft = async () => {
    // Series mode: save all parts
    if (isSeriesMode && seriesParts.length > 0) {
      setIsSaving(true);
      try {
        let allSuccess = true;
        for (const part of seriesParts) {
          const updated = await editContent(part.id, {
            title: part.title,
            content: part.content,
            digest: part.digest || undefined,
            connectionId: connectionId || undefined,
          });
          if (!updated) {
            allSuccess = false;
            break;
          }
        }
        if (allSuccess) {
          toast.success(
            t('aiSocial.series.allSaved') ||
              `${seriesParts.length} articles saved`
          );
          router.push('/ai-social');
        } else {
          toast.error(t('aiSocial.create.saveFailed'));
        }
      } catch {
        toast.error(t('aiSocial.create.saveFailed'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!platform || !title || !content) return;

    setIsSaving(true);

    try {
      if (currentContentId) {
        const updated = await editContent(currentContentId, {
          title,
          content,
          digest: digest || undefined,
          tags: tags.length > 0 ? tags : undefined,
          connectionId: connectionId || undefined,
        });

        if (updated) {
          // Clear draft after successful save
          if (platform && sourceType) {
            const draftId = generateDraftId(
              platform,
              sourceType,
              sourceId || undefined
            );
            deleteDraft(draftId);
          }

          toast.success(t('aiSocial.toast.saved'));
          router.push('/ai-social');
        } else {
          toast.error(t('aiSocial.create.saveFailed'));
        }
      } else {
        const created = await addContent({
          contentType: platform,
          sourceType: sourceType || 'MANUAL',
          sourceUrl: externalUrl || undefined,
          sourceId: sourceId || undefined,
          title,
          content,
          digest: digest || undefined,
          tags: tags.length > 0 ? tags : undefined,
          connectionId: connectionId || undefined,
        });

        if (created) {
          setCurrentContentId(created.id);

          // Clear draft after successful save
          if (platform && sourceType) {
            const draftId = generateDraftId(
              platform,
              sourceType,
              sourceId || undefined
            );
            deleteDraft(draftId);
          }

          toast.success(t('aiSocial.toast.saved'));
          router.push('/ai-social');
        } else {
          toast.error(t('aiSocial.create.saveFailed'));
        }
      }
    } catch {
      toast.error(t('aiSocial.create.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Publish handler
  const handlePublish = async () => {
    // Series mode: publish all parts sequentially
    if (isSeriesMode && seriesParts.length > 0) {
      if (!connectionId && !skipAccount) {
        toast.error(
          t('aiSocial.create.selectAccountFirst') ||
            'Please select a publishing account first'
        );
        setStep(3);
        return;
      }

      setIsPublishing(true);
      try {
        let successCount = 0;
        for (const part of seriesParts) {
          // Update content before publishing
          await editContent(part.id, {
            title: part.title,
            content: part.content,
            digest: part.digest || undefined,
            connectionId: connectionId || undefined,
          });

          const result = await publish(part.id, connectionId || undefined);
          if (result.success) {
            successCount++;
          }
        }

        if (successCount === seriesParts.length) {
          toast.success(
            t('aiSocial.series.allPublished') ||
              `${seriesParts.length} articles published`
          );
          router.push('/ai-social');
        } else {
          toast.error(
            t('aiSocial.series.partialPublish', {
              success: successCount,
              total: seriesParts.length,
            }) || `${successCount}/${seriesParts.length} published`
          );
        }
      } catch {
        toast.error(t('aiSocial.create.publishFailed'));
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    if (!platform || !title || !content) return;

    // Check if account is required
    if (!connectionId && !skipAccount) {
      toast.error(
        t('aiSocial.create.selectAccountFirst') ||
          'Please select a publishing account first'
      );
      setStep(3);
      return;
    }

    setIsPublishing(true);

    try {
      let contentId = currentContentId;

      // Save content first if not saved
      if (!contentId) {
        const created = await addContent({
          contentType: platform,
          sourceType: sourceType || 'MANUAL',
          sourceUrl: externalUrl || undefined,
          sourceId: sourceId || undefined,
          title,
          content,
          digest: digest || undefined,
          tags: tags.length > 0 ? tags : undefined,
          connectionId: connectionId || undefined,
        });

        if (!created) {
          toast.error(t('aiSocial.create.saveFailed'));
          return;
        }
        contentId = created.id;
        setCurrentContentId(contentId);
      } else {
        // Update content
        const updated = await editContent(contentId, {
          title,
          content,
          digest: digest || undefined,
          tags: tags.length > 0 ? tags : undefined,
          connectionId: connectionId || undefined,
        });

        if (!updated) {
          toast.error(t('aiSocial.create.saveFailed'));
          return;
        }
      }

      // Publish
      const result = await publish(contentId, connectionId || undefined);

      if (result.success) {
        // Clear draft after successful publish
        if (platform && sourceType) {
          const draftId = generateDraftId(
            platform,
            sourceType,
            sourceId || undefined
          );
          deleteDraft(draftId);
        }

        toast.success(t('aiSocial.toast.published'));
        router.push('/ai-social');
      } else {
        toast.error(result.errorMessage || t('aiSocial.create.publishFailed'));
      }
    } catch {
      toast.error(t('aiSocial.create.publishFailed'));
    } finally {
      setIsPublishing(false);
    }
  };

  // Auth check
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <AlertCircle className="mb-4 h-12 w-12 text-amber-500" />
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          {t('aiSocial.signIn.title')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('aiSocial.signIn.description')}
        </p>
      </div>
    );
  }

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <SourceSelector />;
      case 2:
        return <PlatformSelector />;
      case 3:
        return <AccountSelector />;
      case 4:
        if (isSeriesMode && seriesParts.length > 0) {
          return <SeriesEditor />;
        }
        return <ContentEditor />;
      default:
        return <SourceSelector />;
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left sidebar - Step navigation */}
      <StepNavigation onSaveDraft={handleSaveDraft} onPublish={handlePublish} />

      {/* Main content area */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="mx-auto min-h-full max-w-3xl p-8">
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
}

export default function CreateSocialContentPage() {
  return (
    <AppShell>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
            </div>
          }
        >
          <CreateSocialContentForm />
        </Suspense>
      </main>
    </AppShell>
  );
}
