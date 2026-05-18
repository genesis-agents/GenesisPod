'use client';

/**
 * 账户级通知偏好设置 (PR-DR1b §7.3.1)
 *
 * 暴露 NotificationDispatcher 公共能力给用户：
 * - 邮件 / 站内全局开关
 * - 业务类型 × 渠道矩阵 (channelSubscriptions)
 * - 全局静默时段 (quietHours)
 * - tier3 即时推主开关 (instantPushForTier3)
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §7.3.1
 */

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  MoonStar,
  Save,
  Loader2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  useNotificationPreferences,
  type NotificationChannel,
  type NotificationPreferences,
} from '@/hooks/domain/useNotifications';

// 业务类型 × 行（按 baseline §15 默认策略 + 实际用户面 5 类）
const NOTIFICATION_TYPE_ROWS: Array<{
  type: string;
  label: string;
  desc: string;
}> = [
  {
    type: 'RADAR_DAILY',
    label: 'AI 雷达每日精选',
    desc: '每日固定时间收 TOP 3 关键信号',
  },
  {
    type: 'RADAR_WEEKLY',
    label: 'AI 雷达周报',
    desc: '周日 18:00 自动汇总本周 ⭐⭐⭐',
  },
  {
    type: 'RADAR_TIER3_INSTANT',
    label: '⭐⭐⭐ 即时推',
    desc: '最高级信号实时推送（默认走站内 + 公众号，不发邮件避风暴）',
  },
  {
    type: 'MISSION_COMPLETED',
    label: 'Mission 完成',
    desc: 'Agent / Research mission 完成通知',
  },
  {
    type: 'FEEDBACK_STATUS_CHANGED',
    label: '反馈状态变更',
    desc: '你提交的反馈被处理时收到通知',
  },
  {
    type: 'KEY_REQUEST_APPROVED',
    label: 'BYOK 密钥申请结果',
    desc: 'admin 审批密钥申请的结果通知',
  },
];

// 4 渠道（PR-DR1a 矩阵）
const CHANNELS: Array<{
  key: NotificationChannel;
  label: string;
  icon: typeof Mail;
  available: boolean;
}> = [
  { key: 'email', label: '邮件', icon: Mail, available: true },
  { key: 'site', label: '站内', icon: Bell, available: true },
  { key: 'wechat', label: '公众号', icon: MessageSquare, available: false }, // DR3 启用
  { key: 'webpush', label: '浏览器', icon: Smartphone, available: false }, // Phase 2
];

export default function NotificationsSettingsPage() {
  const { preferences, loading, updating, updatePreferences } =
    useNotificationPreferences();
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saved, setSaved] = useState(false);

  // 同步 server data → 本地草稿
  useEffect(() => {
    if (preferences && !draft) {
      setDraft({ ...preferences });
    }
  }, [preferences, draft]);

  const matrix = useMemo(
    () => draft?.channelSubscriptions ?? {},
    [draft?.channelSubscriptions]
  );

  const setChannelFor = (
    type: string,
    channel: NotificationChannel,
    value: boolean
  ) => {
    if (!draft) return;
    const newMatrix = { ...matrix };
    newMatrix[type] = { ...(newMatrix[type] ?? {}), [channel]: value };
    setDraft({ ...draft, channelSubscriptions: newMatrix });
  };

  const handleSave = async () => {
    if (!draft) return;
    await updatePreferences({
      emailEnabled: draft.emailEnabled,
      pushEnabled: draft.pushEnabled,
      soundEnabled: draft.soundEnabled,
      quietHoursStart: draft.quietHoursStart || undefined,
      quietHoursEnd: draft.quietHoursEnd || undefined,
      channelSubscriptions: draft.channelSubscriptions,
      instantPushForTier3: draft.instantPushForTier3,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading || !draft) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">通知偏好</h1>
            <p className="mt-1 text-sm text-slate-500">
              控制 AI 雷达 / Mission / 系统通知如何送达你的邮箱、站内、公众号
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={updating}
            className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {updating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? '已保存' : updating ? '保存中…' : '保存设置'}
          </button>
        </header>

        {/* 全局开关 */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            全局开关
          </h2>
          <div className="space-y-3">
            <ToggleRow
              icon={Mail}
              label="邮件接收"
              desc="关掉后所有业务通知不发邮件"
              value={draft.emailEnabled}
              onChange={(v) => setDraft({ ...draft, emailEnabled: v })}
            />
            <ToggleRow
              icon={Bell}
              label="站内 + WebSocket 推送"
              desc="关掉后站内 inbox 仍写入但不实时推送"
              value={draft.pushEnabled}
              onChange={(v) => setDraft({ ...draft, pushEnabled: v })}
            />
            <ToggleRow
              icon={Sparkles}
              label="⭐⭐⭐ 即时推（E2）"
              desc="检出最高级信号时立即推送站内 + 公众号（不发邮件避风暴）"
              value={draft.instantPushForTier3 ?? true}
              onChange={(v) => setDraft({ ...draft, instantPushForTier3: v })}
            />
          </div>
        </section>

        {/* 类型 × 渠道矩阵 */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            业务类型 × 渠道
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            不勾 = 走默认策略；显式勾选 / 关闭会覆盖默认
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">业务类型</th>
                  {CHANNELS.map((ch) => (
                    <th
                      key={ch.key}
                      className="w-24 px-2 py-2 text-center font-medium"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <ch.icon className="h-4 w-4" />
                        <span>{ch.label}</span>
                        {!ch.available && (
                          <span className="text-[10px] text-slate-400">
                            未启用
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_TYPE_ROWS.map((row) => (
                  <tr
                    key={row.type}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-2 py-3">
                      <div className="text-sm font-medium text-slate-900">
                        {row.label}
                      </div>
                      <div className="text-xs text-slate-500">{row.desc}</div>
                    </td>
                    {CHANNELS.map((ch) => {
                      const checked = matrix[row.type]?.[ch.key] ?? null;
                      return (
                        <td key={ch.key} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            disabled={!ch.available}
                            checked={checked === true}
                            onChange={(e) =>
                              setChannelFor(row.type, ch.key, e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-30"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* QuietHours */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
            <MoonStar className="h-4 w-4" />
            全局静默时段
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            该时段内即时推送（如 ⭐⭐⭐ 即时推）静默；站内通知仍写入
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">从</label>
            <input
              type="time"
              value={draft.quietHoursStart ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, quietHoursStart: e.target.value })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
            />
            <label className="text-sm text-slate-700">到</label>
            <input
              type="time"
              value={draft.quietHoursEnd ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, quietHoursEnd: e.target.value })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
            />
            <span className="text-xs text-slate-400">
              支持跨午夜（如 22:00–06:00）
            </span>
          </div>
        </section>

        {/* 渠道绑定状态（信息性） */}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            渠道状态
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-700">📧 邮件</span>
              <span className="text-green-600">✓ 自动启用</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">🔔 站内</span>
              <span className="text-green-600">✓ 自动启用</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">💬 微信公众号</span>
              <span className="text-amber-600">⚠ 未绑定（PR-DR3 启用）</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

interface ToggleRowProps {
  icon: typeof Bell;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  value,
  onChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-slate-500" />
        <div>
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? 'bg-violet-600' : 'bg-slate-300'
        }`}
        aria-pressed={value}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
