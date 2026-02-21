'use client';

import { useState } from 'react';
import {
  REPORT_TEMPLATES,
  validateResourceCount,
  type ReportTemplate,
} from '@/lib/templates/report-templates';
import { toast } from '@/stores';

interface ReportTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (templateId: string) => void;
  selectedCount: number;
}

/**
 * 报告模板选择对话框
 */
export default function ReportTemplateDialog({
  isOpen,
  onClose,
  onGenerate,
  selectedCount,
}: ReportTemplateDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = () => {
    if (!selectedTemplate) return;

    const template = REPORT_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const validation = validateResourceCount(template, selectedCount);
    if (!validation.valid) {
      toast.warning(validation.message ?? '验证失败');
      return;
    }

    onGenerate(selectedTemplate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="mx-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6">
          <h2 className="text-2xl font-bold text-gray-900">选择报告模板</h2>
          <button
            onClick={onClose}
            className="text-2xl text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4 text-sm text-gray-600">
            已选择 {selectedCount} 项资源
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {REPORT_TEMPLATES.map((template) => {
              const validation = validateResourceCount(template, selectedCount);
              const isValid = validation.valid;
              const isSelected = selectedTemplate === template.id;

              return (
                <button
                  key={template.id}
                  disabled={!isValid}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`
                    rounded-lg border-2 p-6 text-left transition-all
                    ${isSelected ? 'border-red-600 bg-red-50' : 'border-gray-200 hover:border-red-300'}
                    ${!isValid ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                  `}
                >
                  {/* Icon */}
                  <div className="mb-3 text-5xl">{template.icon}</div>

                  {/* Title */}
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">
                    {template.name}
                  </h3>

                  {/* Description */}
                  <p className="mb-4 text-sm text-gray-600">
                    {template.description}
                  </p>

                  {/* Metadata */}
                  <div className="space-y-1 text-xs text-gray-500">
                    <div>
                      📄 {template.minItems}-{template.maxItems} 项素材
                    </div>
                    <div>⏱️ 预计 {template.estimatedTime}</div>
                    <div>
                      🤖 模型: {template.model === 'gpt-4' ? 'GPT-4' : 'Grok'}
                    </div>
                  </div>

                  {/* Validation message */}
                  {!isValid && (
                    <div className="mt-3 text-xs text-red-600">
                      {validation.message}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t bg-gray-50 p-6">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selectedTemplate}
            className={`
              rounded-lg px-6 py-2 text-sm font-medium text-white
              ${
                selectedTemplate
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'cursor-not-allowed bg-gray-300'
              }
            `}
          >
            开始生成
          </button>
        </div>
      </div>
    </div>
  );
}
