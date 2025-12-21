'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getPage, pushToNotion, NotionPage } from '@/lib/api/notion';
import Sidebar from '@/components/layout/Sidebar';

export default function NotionPageDetail() {
  const params = useParams();
  const router = useRouter();
  const pageId = params?.pageId as string;

  const [page, setPage] = useState<NotionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  const fetchPage = useCallback(async () => {
    if (!pageId) return;

    try {
      setLoading(true);
      const result = await getPage(pageId);
      setPage(result.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handlePushToNotion = async () => {
    if (!pageId || !page?.isLocallyModified) return;

    try {
      setPushing(true);
      await pushToNotion(pageId);
      await fetchPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render Notion blocks
  const renderBlock = (block: any, index: number) => {
    const { type } = block;

    switch (type) {
      case 'paragraph':
        return (
          <p key={index} className="mb-4 leading-relaxed text-gray-700">
            {renderRichText(block.paragraph?.rich_text)}
          </p>
        );

      case 'heading_1':
        return (
          <h1
            key={index}
            className="mb-4 mt-8 text-3xl font-bold text-gray-900"
          >
            {renderRichText(block.heading_1?.rich_text)}
          </h1>
        );

      case 'heading_2':
        return (
          <h2
            key={index}
            className="mb-3 mt-6 text-2xl font-semibold text-gray-900"
          >
            {renderRichText(block.heading_2?.rich_text)}
          </h2>
        );

      case 'heading_3':
        return (
          <h3
            key={index}
            className="mb-2 mt-4 text-xl font-semibold text-gray-900"
          >
            {renderRichText(block.heading_3?.rich_text)}
          </h3>
        );

      case 'bulleted_list_item':
        return (
          <li key={index} className="mb-1 ml-6 list-disc text-gray-700">
            {renderRichText(block.bulleted_list_item?.rich_text)}
          </li>
        );

      case 'numbered_list_item':
        return (
          <li key={index} className="mb-1 ml-6 list-decimal text-gray-700">
            {renderRichText(block.numbered_list_item?.rich_text)}
          </li>
        );

      case 'to_do':
        return (
          <div key={index} className="mb-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={block.to_do?.checked}
              readOnly
              className="mt-1 h-4 w-4 rounded border-gray-300"
            />
            <span
              className={
                block.to_do?.checked
                  ? 'text-gray-400 line-through'
                  : 'text-gray-700'
              }
            >
              {renderRichText(block.to_do?.rich_text)}
            </span>
          </div>
        );

      case 'quote':
        return (
          <blockquote
            key={index}
            className="my-4 border-l-4 border-gray-300 pl-4 italic text-gray-600"
          >
            {renderRichText(block.quote?.rich_text)}
          </blockquote>
        );

      case 'code':
        return (
          <pre
            key={index}
            className="my-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"
          >
            <code>{renderRichText(block.code?.rich_text)}</code>
          </pre>
        );

      case 'divider':
        return <hr key={index} className="my-6 border-gray-200" />;

      case 'callout':
        return (
          <div
            key={index}
            className="my-4 flex gap-3 rounded-lg bg-gray-50 p-4"
          >
            <span className="text-xl">
              {block.callout?.icon?.emoji || '💡'}
            </span>
            <div className="text-gray-700">
              {renderRichText(block.callout?.rich_text)}
            </div>
          </div>
        );

      case 'image':
        const imageUrl = block.image?.file?.url || block.image?.external?.url;
        return imageUrl ? (
          <figure key={index} className="my-6">
            <img
              src={imageUrl}
              alt={block.image?.caption?.[0]?.plain_text || 'Image'}
              className="rounded-lg"
            />
            {block.image?.caption?.length > 0 && (
              <figcaption className="mt-2 text-center text-sm text-gray-500">
                {renderRichText(block.image.caption)}
              </figcaption>
            )}
          </figure>
        ) : null;

      default:
        return null;
    }
  };

  const renderRichText = (richText: any[] | undefined) => {
    if (!richText || richText.length === 0) return null;

    return richText.map((text, i) => {
      let content: React.ReactNode = text.plain_text;

      // Apply annotations
      if (text.annotations?.bold) {
        content = <strong key={`bold-${i}`}>{content}</strong>;
      }
      if (text.annotations?.italic) {
        content = <em key={`italic-${i}`}>{content}</em>;
      }
      if (text.annotations?.strikethrough) {
        content = <del key={`strike-${i}`}>{content}</del>;
      }
      if (text.annotations?.underline) {
        content = <u key={`underline-${i}`}>{content}</u>;
      }
      if (text.annotations?.code) {
        content = (
          <code
            key={`code-${i}`}
            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-pink-600"
          >
            {content}
          </code>
        );
      }

      // Handle links
      if (text.href) {
        content = (
          <a
            key={`link-${i}`}
            href={text.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {content}
          </a>
        );
      }

      return <span key={i}>{content}</span>;
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900">
              Page Not Found
            </h2>
            <p className="mt-2 text-gray-600">
              {error || 'The page you are looking for does not exist.'}
            </p>
            <Link
              href="/library?tab=notion"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  {page.icon && <span className="text-2xl">{page.icon}</span>}
                  <h1 className="text-xl font-semibold text-gray-900">
                    {page.title || 'Untitled'}
                  </h1>
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                  <span>Updated {formatDate(page.notionUpdatedAt)}</span>
                  {page.isLocallyModified && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <svg
                        className="mr-1 h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 8 8"
                      >
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                      Locally Modified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {page.isLocallyModified && (
                <button
                  onClick={handlePushToNotion}
                  disabled={pushing}
                  className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {pushing ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Pushing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      Push to Notion
                    </>
                  )}
                </button>
              )}
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Open in Notion
              </a>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <article className="mx-auto max-w-4xl px-8 py-8">
            {/* Cover image */}
            {page.coverUrl && (
              <div className="mb-8 overflow-hidden rounded-xl">
                <img
                  src={page.coverUrl}
                  alt="Cover"
                  className="h-64 w-full object-cover"
                />
              </div>
            )}

            {/* Blocks content */}
            <div className="prose prose-gray max-w-none">
              {page.blocks && page.blocks.length > 0 ? (
                page.blocks.map((block, index) => renderBlock(block, index))
              ) : page.plainTextContent ? (
                <div className="whitespace-pre-wrap text-gray-700">
                  {page.plainTextContent}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <svg
                    className="h-12 w-12 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="mt-4">This page has no content yet.</p>
                </div>
              )}
            </div>

            {/* Version history */}
            {page.versions && page.versions.length > 0 && (
              <div className="mt-12 border-t border-gray-200 pt-8">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  Version History
                </h3>
                <div className="space-y-2">
                  {page.versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                          v{version.version}
                        </span>
                        <span className="text-sm text-gray-700">
                          {version.source === 'notion'
                            ? 'Synced from Notion'
                            : 'Local edit'}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatDate(version.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </main>
      </div>
    </div>
  );
}
