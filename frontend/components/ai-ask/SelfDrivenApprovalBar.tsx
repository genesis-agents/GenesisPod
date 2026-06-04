/**
 * SelfDrivenApprovalBar
 *
 * Renders the HITL approval UI when the runner emits `awaiting_approval`.
 * Shown as an inline bar (not a blocking full-screen modal) so the user can
 * still read the plan/stream context above while deciding.
 *
 * Interactions:
 *   - Approve button  → POST /admin/approvals/{requestId}/respond { approved: true }
 *   - Reject button   → POST /admin/approvals/{requestId}/respond { approved: false }
 *   - Append textarea → submitted together with approve (feedback field)
 *
 * The bar is dismissed when the parent passes resolved=true (approval_resolved event).
 *
 * Design note: requestId may be "" at first emit (backend sends the event before
 * the DB record is created). We disable the buttons until requestId is non-empty.
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
} from '@/lib/api/self-driven-stream';
import { respondApproval } from '@/lib/api/self-driven-stream';
import { logger } from '@/lib/utils/logger';

const GATE_LABEL: Record<AwaitingApprovalEvent['gate'], string> = {
  plan_confirm: 'Plan Confirmation',
  deliver_confirm: 'Delivery Confirmation',
};

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
  const [appendOpen, setAppendOpen] = useState(false);
  const [appendText, setAppendText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appendRef = useRef<HTMLTextAreaElement>(null);

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
            ? ' (timed out — auto-resolved)'
            : approved
              ? ' approved'
              : ' rejected'}
        </span>
        {resolved.appendInstruction && (
          <span className="ml-auto text-xs opacity-70">
            Append instruction injected
          </span>
        )}
      </div>
    );
  }

  const hasRequestId = Boolean(awaiting.requestId);

  async function submit(approved: boolean) {
    if (!hasRequestId) return;
    setSubmitting(true);
    setError(null);
    try {
      await respondApproval({
        requestId: awaiting.requestId,
        approved,
        feedback: appendText.trim() || undefined,
        token,
      });
      setAppendOpen(false);
    } catch (err) {
      logger.error('[SelfDrivenApprovalBar] respond failed:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to submit approval'
      );
    } finally {
      setSubmitting(false);
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
            {GATE_LABEL[awaiting.gate]} Required
          </span>
          {!hasRequestId && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-600">
              <Loader size={11} className="animate-spin" aria-hidden />
              Preparing…
            </span>
          )}
        </div>

        {/* Prompt */}
        <p className="px-4 py-3 text-sm text-amber-900">{awaiting.prompt}</p>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-amber-100 px-4 py-2.5">
          <Button
            variant="default"
            size="sm"
            disabled={!hasRequestId || submitting}
            onClick={() => void submit(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500"
          >
            {submitting ? (
              <Loader size={13} className="animate-spin" aria-hidden />
            ) : (
              <CheckCircle size={13} aria-hidden />
            )}
            <span className="ml-1.5">Approve</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!hasRequestId || submitting}
            onClick={() => void submit(false)}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <XCircle size={13} aria-hidden />
            <span className="ml-1.5">Reject</span>
          </Button>

          <button
            type="button"
            disabled={!hasRequestId || submitting}
            onClick={() => setAppendOpen(true)}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-50"
          >
            <MessageSquarePlus size={13} aria-hidden />
            Append instruction
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
        title="Append Instruction"
        subtitle="This text will be injected into the mission context before execution continues."
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
              Cancel
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
              Approve + Append
            </Button>
          </>
        }
      >
        <Textarea
          ref={appendRef}
          rows={4}
          placeholder="e.g. Focus the report on cost implications and add a risk section."
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          disabled={submitting}
        />
      </Modal>
    </>
  );
}
