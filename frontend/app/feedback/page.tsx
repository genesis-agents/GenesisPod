'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import {
  MessageSquare,
  Bug,
  Lightbulb,
  Zap,
  MessageCircle,
  Send,
  CheckCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
  Github,
  Paperclip,
  X,
  Upload,
  Image as ImageIcon,
  FileText,
  File,
} from 'lucide-react';

type FeedbackType = 'bug' | 'feature' | 'improvement' | 'other';

interface UploadedFile {
  file: File;
  preview?: string;
}

const FEEDBACK_EMAIL = 'hello.junjie.duan@gmail.com';
const GITHUB_ISSUES_URL =
  'https://github.com/JUNJIE-DUAN/deepdive-engine/issues';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
];

export default function Feedback() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('feature');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const validFiles: UploadedFile[] = [];

      for (const file of fileArray) {
        if (files.length + validFiles.length >= MAX_FILES) {
          setError(`Maximum ${MAX_FILES} files allowed`);
          break;
        }

        if (file.size > MAX_FILE_SIZE) {
          setError(`File "${file.name}" exceeds 10MB limit`);
          continue;
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
          setError(
            `File type not supported. Allowed: images, PDF, text files.`
          );
          continue;
        }

        const uploadedFile: UploadedFile = { file };

        // Create preview for images
        if (file.type.startsWith('image/')) {
          uploadedFile.preview = URL.createObjectURL(file);
        }

        validFiles.push(uploadedFile);
      }

      if (validFiles.length > 0) {
        setFiles((prev) => [...prev, ...validFiles]);
        setError(null);
      }
    },
    [files.length]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      // Revoke preview URL to prevent memory leaks
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return ImageIcon;
    if (file.type === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('type', feedbackType);
      formData.append('title', title);
      formData.append('description', description);
      if (email) formData.append('userEmail', email);
      formData.append('userAgent', navigator.userAgent);
      formData.append('url', window.location.href);

      // Append files
      files.forEach((uploadedFile) => {
        formData.append('files', uploadedFile.file);
      });

      const response = await fetch('/api/feedback', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setSubmitted(true);
        setFeedbackId(data.feedbackId || null);
        // Clean up file previews
        files.forEach((f) => {
          if (f.preview) URL.revokeObjectURL(f.preview);
        });
      } else {
        setError(data.error || 'Failed to submit feedback');
      }
    } catch (err) {
      setError('Network error. Please try again or use GitHub Issues.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setTitle('');
    setDescription('');
    setEmail('');
    setFiles([]);
    setError(null);
    setFeedbackId(null);
  };

  const feedbackTypes = [
    {
      value: 'bug' as FeedbackType,
      label: 'Bug Report',
      icon: Bug,
      description: 'Report a bug or issue',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-500',
    },
    {
      value: 'feature' as FeedbackType,
      label: 'Feature Request',
      icon: Lightbulb,
      description: 'Suggest a new feature',
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
      borderColor: 'border-amber-500',
    },
    {
      value: 'improvement' as FeedbackType,
      label: 'Improvement',
      icon: Zap,
      description: 'Suggest an improvement',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-500',
    },
    {
      value: 'other' as FeedbackType,
      label: 'Other',
      icon: MessageCircle,
      description: 'General feedback',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      borderColor: 'border-gray-500',
    },
  ];

  const selectedType = feedbackTypes.find((t) => t.value === feedbackType)!;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Send Feedback</h1>
              <p className="text-sm text-gray-500">Help us improve DeepDive</p>
            </div>
          </div>
          <Link
            href="/feedback/history"
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            My Feedback
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            {submitted ? (
              /* Success Message */
              <div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-gray-900">
                  Thank you!
                </h2>
                <p className="mb-4 text-gray-600">
                  Your feedback has been submitted successfully.
                </p>
                {feedbackId && (
                  <p className="mb-4 text-sm text-gray-500">
                    Reference: {feedbackId}
                  </p>
                )}
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={resetForm}
                    className="rounded-lg bg-violet-600 px-6 py-2 font-medium text-white transition-colors hover:bg-violet-700"
                  >
                    Submit Another
                  </button>
                  <a
                    href={GITHUB_ISSUES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <Github className="h-4 w-4" />
                    Or open a GitHub Issue for faster tracking
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              /* Feedback Form */
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Error Message */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">{error}</p>
                        <a
                          href={GITHUB_ISSUES_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-sm text-red-700 hover:text-red-900"
                        >
                          Open GitHub Issue instead
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback Type Selection */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    What type of feedback do you have?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {feedbackTypes.map((type) => {
                      const Icon = type.icon;
                      const isSelected = feedbackType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFeedbackType(type.value)}
                          className={`rounded-lg border-2 p-4 text-left transition-all ${
                            isSelected
                              ? `${type.borderColor} ${type.bgColor}`
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`rounded-lg p-2 ${isSelected ? type.bgColor : 'bg-gray-100'}`}
                            >
                              <Icon
                                className={`h-5 w-5 ${isSelected ? type.color : 'text-gray-500'}`}
                              />
                            </div>
                            <div>
                              <p
                                className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}
                              >
                                {type.label}
                              </p>
                              <p className="text-sm text-gray-500">
                                {type.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <label
                    htmlFor="title"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of your feedback"
                    required
                    maxLength={200}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {title.length}/200 characters
                  </p>
                </div>

                {/* Description */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <label
                    htmlFor="description"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      feedbackType === 'bug'
                        ? 'Please describe the issue, steps to reproduce, and any error messages...'
                        : feedbackType === 'feature'
                          ? "Describe the feature you'd like to see and how it would help you..."
                          : feedbackType === 'improvement'
                            ? 'Explain what could be improved and why...'
                            : 'Share your thoughts, suggestions, or questions...'
                    }
                    required
                    rows={6}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>

                {/* Email (Optional) */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Your Email{' '}
                    <span className="font-normal text-gray-500">
                      (Optional)
                    </span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Provide your email if you'd like us to follow up with you.
                  </p>
                </div>

                {/* Attachments (Optional) */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Attachments{' '}
                    <span className="font-normal text-gray-500">
                      (Optional, max {MAX_FILES} files, 10MB each)
                    </span>
                  </label>

                  {/* Drop Zone */}
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                      dragActive
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ALLOWED_TYPES.join(',')}
                      onChange={(e) =>
                        e.target.files && handleFiles(e.target.files)
                      }
                      className="hidden"
                    />
                    <Upload
                      className={`mx-auto h-8 w-8 ${dragActive ? 'text-violet-500' : 'text-gray-400'}`}
                    />
                    <p className="mt-2 text-sm text-gray-600">
                      {dragActive
                        ? 'Drop files here'
                        : 'Drag and drop files here, or click to select'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Images, PDF, or text files
                    </p>
                  </div>

                  {/* File List */}
                  {files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {files.map((uploadedFile, index) => {
                        const FileIcon = getFileIcon(uploadedFile.file);
                        return (
                          <div
                            key={index}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                          >
                            {uploadedFile.preview ? (
                              <img
                                src={uploadedFile.preview}
                                alt={uploadedFile.file.name}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200">
                                <FileIcon className="h-5 w-5 text-gray-600" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-700">
                                {uploadedFile.file.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(uploadedFile.file.size)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    <span className="text-red-500">*</span> Required fields
                  </p>
                  <button
                    type="submit"
                    disabled={!title || !description || submitting}
                    className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Feedback
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Additional Info */}
            {!submitted && (
              <div className="mt-8 space-y-4">
                {/* Contact Email */}
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-5 w-5 flex-shrink-0 text-violet-600" />
                    <div>
                      <h3 className="font-semibold text-violet-900">
                        Direct Contact
                      </h3>
                      <p className="mt-1 text-sm text-violet-700">
                        You can also reach us directly at{' '}
                        <a
                          href={`mailto:${FEEDBACK_EMAIL}`}
                          className="font-medium underline hover:no-underline"
                        >
                          {FEEDBACK_EMAIL}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>

                {/* GitHub Issues */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-start gap-3">
                    <Github className="h-5 w-5 flex-shrink-0 text-gray-700" />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        GitHub Issues
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        For bug reports and feature requests, you can also{' '}
                        <a
                          href={GITHUB_ISSUES_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-violet-600 hover:text-violet-700"
                        >
                          open an issue on GitHub
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Privacy Note */}
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                  <div className="flex items-start gap-3">
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-blue-900">
                        Your privacy matters
                      </h3>
                      <p className="mt-1 text-sm text-blue-700">
                        We take your feedback seriously and will use it to
                        improve DeepDive. Your information will never be shared
                        with third parties.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
