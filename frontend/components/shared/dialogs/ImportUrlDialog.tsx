'use client';

import React, { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

type ResourceType =
  | 'PAPER'
  | 'BLOG'
  | 'NEWS'
  | 'YOUTUBE_VIDEO'
  | 'REPORT'
  | 'EVENT'
  | 'RSS'
  | 'POLICY';

interface ImportUrlDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onImportSuccess: () => void;
  apiBaseUrl: string;
}

interface ParsedMetadata {
  url: string;
  domain: string;
  title: string;
  description?: string;
  imageUrl?: string;
  authors?: string[];
  publishedDate?: string;
  language: string;
  contentType: string;
  siteName?: string;
  canonicalUrl?: string;
  favicon?: string;
  wordCount?: number;
}

type DialogStep = 'input-url' | 'preview' | 'confirm';

const RESOURCE_TYPE_DISPLAY = {
  papers: { name: 'Academic Paper', type: 'PAPER' as ResourceType },
  blogs: { name: 'Research Blog', type: 'BLOG' as ResourceType },
  reports: { name: 'Industry Report', type: 'REPORT' as ResourceType },
  youtube: { name: 'YouTube Video', type: 'YOUTUBE_VIDEO' as ResourceType },
  news: { name: 'Tech News', type: 'NEWS' as ResourceType },
  policy: { name: 'Policy Document', type: 'POLICY' as ResourceType },
};

export function ImportUrlDialog({
  isOpen,
  onClose,
  activeTab,
  onImportSuccess,
  apiBaseUrl,
}: ImportUrlDialogProps) {
  const [step, setStep] = useState<DialogStep>('input-url');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState<ParsedMetadata | null>(null);
  const [editedTitle, setEditedTitle] = useState('');

  if (!isOpen) return null;

  const resourceTypeInfo = RESOURCE_TYPE_DISPLAY[
    activeTab as keyof typeof RESOURCE_TYPE_DISPLAY
  ] || {
    name: 'Resource',
    type: 'PAPER' as ResourceType,
  };

  const handleClose = () => {
    setStep('input-url');
    setUrl('');
    setError('');
    setMetadata(null);
    setEditedTitle('');
    onClose();
  };

  const handleValidateUrl = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/data-management/parse-url-full`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            resourceType: resourceTypeInfo.type,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to parse URL');
      }

      if (!data.data || !data.data.metadata) {
        throw new Error('Invalid response data format');
      }

      setMetadata(data.data.metadata);
      setEditedTitle(data.data.metadata.title);
      setStep('preview');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!metadata) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/data-management/import-with-metadata`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            resourceType: resourceTypeInfo.type,
            metadata: {
              ...metadata,
              title: editedTitle || metadata.title,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Import failed');
      }

      handleClose();
      onImportSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Import {resourceTypeInfo.name}
            {step === 'input-url' && ' - Enter URL'}
            {step === 'preview' && ' - Preview'}
            {step === 'confirm' && ' - Confirm Import'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Step indicator */}
          <div className="mb-4 flex gap-2">
            <div
              className={`h-1 flex-1 rounded ${step === 'input-url' ? 'bg-blue-600' : 'bg-gray-300'}`}
            />
            <div
              className={`h-1 flex-1 rounded ${step === 'preview' ? 'bg-blue-600' : 'bg-gray-300'}`}
            />
            <div
              className={`h-1 flex-1 rounded ${step === 'confirm' ? 'bg-blue-600' : 'bg-gray-300'}`}
            />
          </div>

          {/* Step 1: Input URL */}
          {step === 'input-url' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h4 className="mb-2 font-semibold text-blue-900">
                  📋 Instructions
                </h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li>
                    ✓ Enter the full URL of the{' '}
                    {resourceTypeInfo.name.toLowerCase()}
                  </li>
                  <li>
                    ✓ The system will automatically extract title, description,
                    etc.
                  </li>
                  <li>✓ You can edit this information in the next step</li>
                  <li>✓ Supports whitelisted websites</li>
                </ul>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Resource URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g., https://arxiv.org/abs/2024.xxxxx"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleValidateUrl()}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the complete URL and press Enter or click the button
                  below to validate
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  💡 URL Examples:
                </p>
                <div className="space-y-2 text-xs text-gray-600">
                  {resourceTypeInfo.type === 'PAPER' && (
                    <>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://arxiv.org/abs/2024.xxxxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://openreview.net/forum?id=xxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://ieeexplore.ieee.org/document/xxx
                      </div>
                    </>
                  )}
                  {resourceTypeInfo.type === 'BLOG' && (
                    <>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://medium.com/@username/title-xxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://dev.to/username/article-title-xxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://hashnode.com/post/article-xxx
                      </div>
                    </>
                  )}
                  {resourceTypeInfo.type === 'NEWS' && (
                    <>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://techcrunch.com/xxx/article-title/
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://arstechnica.com/xxx/article-title/
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://theverge.com/xxx/article
                      </div>
                    </>
                  )}
                  {resourceTypeInfo.type === 'YOUTUBE_VIDEO' && (
                    <>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://youtube.com/watch?v=xxxxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://youtu.be/xxxxx
                      </div>
                    </>
                  )}
                  {resourceTypeInfo.type === 'POLICY' && (
                    <>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://whitehouse.gov/presidential-actions/xxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://congress.gov/bill/xxx
                      </div>
                      <div className="rounded border border-gray-300 bg-white p-2 font-mono text-xs">
                        https://brookings.edu/research/xxx
                      </div>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Validation Failed</p>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && metadata && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={18} className="text-green-600" />
                  Preview Information
                </h4>
                {metadata.imageUrl && (
                  <img
                    src={metadata.imageUrl}
                    alt={metadata.title}
                    className="mb-3 h-32 w-full rounded object-cover"
                  />
                )}
                <p className="mb-2 font-medium">{metadata.title}</p>
                {metadata.description && (
                  <p className="mb-2 line-clamp-2 text-sm text-gray-600">
                    {metadata.description}
                  </p>
                )}
                {metadata.publishedDate && (
                  <p className="text-xs text-gray-500">
                    Published: {metadata.publishedDate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Edit Title (optional)
                </label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>

              {error && (
                <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-red-700">
                  <AlertCircle size={20} className="flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && metadata && (
            <div className="space-y-3 rounded-lg bg-gray-50 p-4">
              <h4 className="font-semibold">Import Summary</h4>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Resource Type</dt>
                  <dd className="font-medium">{resourceTypeInfo.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Domain</dt>
                  <dd className="font-medium">{metadata.domain}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Title</dt>
                  <dd className="font-medium">
                    {editedTitle || metadata.title}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t px-6 py-4">
          {step !== 'input-url' && (
            <button
              onClick={() => {
                if (step === 'preview') setStep('input-url');
                else if (step === 'confirm') setStep('preview');
              }}
              disabled={isLoading}
              className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          )}

          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>

          {step === 'input-url' && (
            <button
              onClick={handleValidateUrl}
              disabled={!url || isLoading}
              className="ml-auto flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Validate & Next
            </button>
          )}

          {step === 'preview' && (
            <button
              onClick={() => setStep('confirm')}
              disabled={!editedTitle}
              className="ml-auto rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Confirm Info
            </button>
          )}

          {step === 'confirm' && (
            <button
              onClick={handleImport}
              disabled={isLoading}
              className="ml-auto flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Confirm Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
