/**
 * SelfDrivenApprovalBar
 *
 * Renders the HITL approval UI when the runner emits `awaiting_approval`.
 * Shown as an inline bar (not a blocking full-screen modal) so the user can
 * still read the plan/stream context above while deciding.
 *
 * When the event carries `choices`, each choice is rendered as a selectable
 * card. Clicking a choice immediately approves with that choice id. The legacy
 * Approve/Reject/Append-instruction actions are shown as a fallback when
 * `choices` is absent or empty (older missions / generation failed).
 *
 * Interactions (owner-scoped, keyed by missionId — the backend resolves the
 * mission's open gate, so the UI never needs the requestId):
 *   - Choice card     → POST { approved: true, choice: id }
 *   - Approve button  → POST { approved: true }            (fallback)
 *   - Reject button   → POST { approved: false }
 *   - Append textarea → submitted together with approve (feedback field)
 *
 * The bar is dismissed when the parent passes resolved=true (approval_resolved event).
 */
'use client';

import { useState, useRef } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader,
  MessageSquarePlus,
  ShieldAlert,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { Textarea } from '@/components/ui/form/Textarea';
import type {
  AwaitingApprovalEvent,
  ApprovalResolvedEvent,
  ApprovalChoice,
} from '@/lib/api/self-driven-stream';
import { respondApproval } from '@/lib/api/self-driven-stream';
import { logger } from '@/lib/utils/logger';
import { useI18n } from '@/lib/i18n/i18n-context';

interface SelfDrivenApprovalBarProps {
  awaiting: AwaitingApprovalEvent;
  resolved: ApprovalResolvedEvent | null;
  token: string;
}

export function SelfDrivenApprovalBar({
  awaiting,
  resolved,
  token,
}: SelfDrivenApprovalBarProps) {
  const { t } = useI18n();
  const [appendOpen, setAppendOpen] = useState(false);
  const [appendText, setAppendText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeChoiceId, setActiveChoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appendRef = useRef<HTMLTextAreaElement>(null);

  const GATE_LABEL: Record<AwaitingApprovalEvent['gate'], string> = {
    plan_confirm: t('aiAsk.selfDriven.planConfirmation'),
    deliver_confirm: t('aiAsk.selfDriven.deliveryConfirmation'),
  };

  const hasChoices =
    Array.isArray(awaiting.choices) && awaiting.choices.length > 0;

  // Once resolved, show the outcome pill and hide action buttons
  if (resolved) {
    const approved = resolved.approved;
    const timedOut = resolved.timedOut;
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
          approved
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}
      >
        {approved ? (
          <CheckCircle size={14} aria-hidden />
        ) : (
          <XCircle size={14} aria-hidden />
        )}
        <span className="font-medium">
          {GATE_LABEL[awaiting.gate]}
          {timedOut
            ? t('aiAsk.selfDriven.timedOutSuffix')
            : approved
              ? t('aiAsk.selfDriven.approvedSuffix')
              : t('aiAsk.selfDriven.rejectedSuffix')}
        </span>
        {resolved.appendInstruction && (
          <span className="ml-auto text-xs opacity-70">
            {t('aiAsk.selfDriven.appendInjected')}
          </span>
        )}
      </div>
    );
  }

  async function submit(approved: boolean, choiceId?: string) {
    setSubmitting(true);
    setError(null);
    if (choiceId) setActiveChoiceId(choiceId);
    try {
      await respondApproval({
        missionId: awaiting.missionId,
        approved,
        feedback: appendText.trim() || undefined,
        token,
        choice: choiceId,
      });
      setAppendOpen(false);
    } catch (err) {
      logger.error('[SelfDrivenApprovalBar] respond failed:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to submit approval'
      );
    } finally {
      setSubmitting(false);
      setActiveChoiceId(null);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-2.5">
          <ShieldAlert
            size={15}
            className="shrink-0 text-amber-600"
            aria-hidden
          />
          <span className="text-sm font-semibold text-amber-800">
            {t('aiAsk.selfDriven.required', {
              label: GATE_LABEL[awaiting.gate],
            })}
          </span>
        </div>

        {/* Prompt */}
        <p className="px-4 py-3 text-sm text-amber-900">{awaiting.prompt}</p>

        {/* Dynamic choices — rendered when backend provides them */}
        {hasChoices && (
          <div className="flex flex-col gap-2 border-t border-amber-100 px-4 py-3">
            <span className="text-xs font-medium text-amber-700">
              {t('aiAsk.selfDriven.choicesLabel')}
            </span>
            <div className="flex flex-col gap-2">
              {(awaiting.choices as ApprovalChoice[]).map((choice) => {
                const isActive = activeChoiceId === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => void submit(true, choice.id)}
                    className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="mt-0.5 shrink-0">
                      {isActive ? (
                        <Loader
                          size={14}
                          className="animate-spin text-emerald-600"
                          aria-hidden
                        />
                      ) : (
                        <CheckCircle
                          size={14}
                          className="text-amber-400"
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-amber-900">
                        {choice.label}
                      </span>
                      {choice.description && (
                        <span className="text-xs text-amber-700 opacity-80">
                          {choice.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Fallback actions — shown when no choices OR always available for Reject / Append */}
        <div className="flex items-center gap-2 border-t border-amber-100 px-4 py-2.5">
          {/* Approve button shown only when there are no dynamic choices */}
          {!hasChoices && (
            <Button
              variant="default"
              size="sm"
              disabled={submitting}
              onClick={() => void submit(true)}
              className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500"
            >
              {submitting ? (
                <Loader size={13} className="animate-spin" aria-hidden />
              ) : (
                <CheckCircle size={13} aria-hidden />
              )}
              <span className="ml-1.5">{t('aiAsk.selfDriven.approve')}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => void submit(false)}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <XCircle size={13} aria-hidden />
            <span className="ml-1.5">{t('aiAsk.selfDriven.reject')}</span>
          </Button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => setAppendOpen(true)}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-50"
          >
            <MessageSquarePlus size={13} aria-hidden />
            {t('aiAsk.selfDriven.appendInstruction')}
          </button>
        </div>

        {/* Inline error */}
        {error && (
          <p className="border-t border-amber-100 px-4 py-2 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Append instruction modal */}
      <Modal
        open={appendOpen}
        onClose={() => setAppendOpen(false)}
        title={t('aiAsk.selfDriven.appendModalTitle')}
        subtitle={t('aiAsk.selfDriven.appendModalSubtitle')}
        size="md"
        closeOnOverlayClick={false}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAppendOpen(false)}
              disabled={submitting}
            >
              {t('aiAsk.selfDriven.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={submitting || !appendText.trim()}
              onClick={() => void submit(true)}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {submitting && (
                <Loader size={13} className="mr-1.5 animate-spin" aria-hidden />
              )}
              {t('aiAsk.selfDriven.approveAppend')}
            </Button>
          </>
        }
      >
        <Textarea
          ref={appendRef}
          rows={4}
          placeholder={t('aiAsk.selfDriven.appendPlaceholder')}
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          disabled={submitting}
        />
      </Modal>
    </>
  );
}
