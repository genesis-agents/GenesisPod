'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

interface AutoConfigureResult {
  createdCount: number;
  skippedCount: number;
  items: Array<{
    provider: string;
    modelType: string;
    modelId: string;
    action: 'created' | 'skipped' | 'skipped-provider-no-match';
    reason?: string;
  }>;
  missingTypes: string[];
}

/**
 * 一键 AI 配置按钮：风格跟管理员的「Add Model」一致（同色、同尺寸、同圆角）。
 * 点击后弹出确认 Modal → 调 /user/model-configs/auto-configure → 显示结果。
 */
export function UserModelsAutoConfigureButton({
  disabled,
  onDone,
}: {
  disabled?: boolean;
  onDone?: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutoConfigureResult | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const res = await apiClient.post<AutoConfigureResult>(
        '/user/model-configs/auto-configure',
        {}
      );
      setResult(res);
      if (res.createdCount > 0) {
        toast.success(
          `已创建 ${res.createdCount} 个模型配置${
            res.skippedCount ? `，跳过 ${res.skippedCount} 个已存在` : ''
          }`
        );
      } else if (res.skippedCount > 0) {
        toast.info('所有推荐模型已经配置过了');
      } else {
        toast.error(
          '没有可配置的模型。请确认至少有一个 Provider 的 Key 能正常访问 /v1/models'
        );
      }
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message || '一键配置失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={disabled || running}
        className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 shadow-sm hover:bg-purple-100 disabled:opacity-50"
        title={
          disabled
            ? '先在 API Keys Tab 配置至少一个 Provider 的 Key'
            : '自动为每个已配 Key 创建推荐的模型配置（CHAT / CHAT_FAST / EMBEDDING 等）'
        }
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        一键 AI 配置
      </button>

      {showConfirm && !result && (
        <Modal
          open
          onClose={() => setShowConfirm(false)}
          size="md"
          title="一键 AI 配置"
          subtitle="自动为你的每个 Provider Key 创建推荐模型"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={running}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                开始自动配置
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-gray-700">
            <p>系统会：</p>
            <ol className="ml-5 list-decimal space-y-1 text-gray-600">
              <li>用你的每个 Personal Key 调 Provider 的 /v1/models</li>
              <li>
                按推荐矩阵（OpenAI 用 gpt-4o/gpt-4o-mini/text-embedding-3-*;
                Claude 用 claude-3.5-sonnet/haiku; Cohere rerank ...） 自动选定
                modelId
              </li>
              <li>
                为每个 modelType 创建 UserModelConfig，第一个命中的自动设为默认
              </li>
              <li>已经配置过的模型不会重复创建</li>
            </ol>
            <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800">
              结果可以随时在列表里编辑、删除或改默认。
            </p>
          </div>
        </Modal>
      )}

      {result && (
        <Modal
          open
          onClose={() => {
            setResult(null);
            setShowConfirm(false);
          }}
          size="lg"
          title="一键配置完成"
          subtitle={`创建 ${result.createdCount} 个，跳过 ${result.skippedCount} 个`}
          footer={
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setResult(null);
                  setShowConfirm(false);
                }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                完成
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {result.missingTypes.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                以下必需类型仍未配置：
                <strong> {result.missingTypes.join(', ')}</strong>
                。建议手动添加或为这些类型的 Provider 配置 Key。
              </div>
            )}
            <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-gray-200">
              {result.items.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 uppercase text-gray-600">
                      {it.provider}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                      {it.modelType}
                    </span>
                    <code className="font-mono text-gray-700">
                      {it.modelId}
                    </code>
                  </div>
                  <span
                    className={`font-medium ${
                      it.action === 'created'
                        ? 'text-green-600'
                        : it.action === 'skipped'
                          ? 'text-gray-500'
                          : 'text-red-500'
                    }`}
                  >
                    {it.action === 'created'
                      ? '✓ 新建'
                      : it.action === 'skipped'
                        ? '— 跳过'
                        : '✗ ' + (it.reason ?? '无匹配')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
