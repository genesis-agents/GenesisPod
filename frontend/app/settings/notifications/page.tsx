'use client';

/**
 * 账户级通知偏好设置 (PR-DR1b §7.3.1)
 *
 * 暴露 NotificationDispatcher 公共能力给用户：
 * - 邮件 / 站内全局开关
 * - 业务类型 × 渠道矩阵 (channelSubscriptions) —— 三态：默认 / 开 / 关
 * - 全局静默时段 (quietHours)
 * - tier3 即时推主开关 (instantPushForTier3)
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §7.3.1
 *
 * R2 整改要点：
 * - 矩阵恢复"默认/开/关"真三态（Segmented 控件），可清回 null 走默认策略
 * - Tier3 主开关与矩阵 RADAR_TIER3_INSTANT 行关系明确：主开关 OFF 时整类静音
 * - 未启用渠道（wechat/webpush）强制 unchecked + tooltip 而非 "可勾但 disabled"
 * - handleSave 加 try-catch + 错误 banner，避免 unhandled rejection 丢编辑
 * - checkbox/segmented 加 aria-label，无 emoji
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
  AlertTriangle,
  Star,
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
    desc: '周日 18:00 自动汇总本周 Tier 3 信号',
  },
  {
    type: 'RADAR_TIER3_INSTANT',
    label: '最高级 (Tier 3) 信号即时推',
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
  unavailableReason?: string;
}> = [
  { key: 'email', label: '邮件', icon: Mail, available: true },
  { key: 'site', label: '站内', icon: Bell, available: true },
  {
    key: 'wechat',
    label: '公众号',
    icon: MessageSquare,
    available: false,
    unavailableReason: 'PR-DR3 启用后可绑定微信公众号',
  },
  {
    key: 'webpush',
    label: '浏览器',
    icon: Smartphone,
    available: false,
    unavailableReason: 'Phase 2 启用浏览器推送',
  },
];

// 三态控件值：null = 走默认策略；true = 强制开；false = 强制关
type TriState = boolean | null;

export default function NotificationsSettingsPage() {
  const { preferences, loading, updating, error, refresh, updatePreferences } =
    useNotificationPreferences();
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // 三态写入：value === null 清除该渠道键（回到默认策略）
  const setChannelFor = (
    type: string,
    channel: NotificationChannel,
    value: TriState
  ) => {
    if (!draft) return;
    const newMatrix = { ...matrix };
    const row = { ...(newMatrix[type] ?? {}) } as Partial<
      Record<NotificationChannel, boolean>
    >;
    if (value === null) {
      delete row[channel];
    } else {
      row[channel] = value;
    }
    if (Object.keys(row).length === 0) {
      delete newMatrix[type];
    } else {
      newMatrix[type] = row;
    }
    setDraft({ ...draft, channelSubscriptions: newMatrix });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaveError(null);
    try {
      await updatePreferences({
        emailEnabled: draft.emailEnabled,
        pushEnabled: draft.pushEnabled,
        soundEnabled: draft.soundEnabled,
        quietHoursStart: draft.quietHoursStart || undefined,
        quietHoursEnd: draft.quietHoursEnd || undefined,
        channelSubscriptions: draft.channelSubscriptions,
        instantPushForTier3: draft.instantPushForTier3,
      });
      // R1 frontend P1 整改：保存成功后 setDraft(null) 让 useEffect 重新水合
      // 否则后续 server transform / 默认值不进 draft，下次保存仍是旧值
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      // R2 frontend P1 整改：try-catch + 错误 banner，draft 保留供重试
      const msg = err instanceof Error ? err.message : '保存失败，请稍后重试';
      setSaveError(msg);
      setSaved(false);
    }
  };

  if (loading && !draft) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  if (!loading && error && !draft) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl p-6">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">加载通知偏好失败</div>
              <div className="mt-0.5 text-xs text-red-600">
                {error instanceof Error
                  ? error.message
                  : '网络异常，请检查连接后重试'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              重试
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!draft) {
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

        {saveError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">保存失败</div>
              <div className="text-xs">{saveError}</div>
            </div>
          </div>
        )}

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
              label="Tier 3 信号即时推（E2）"
              desc="此为总闸：OFF 则整类静音；ON 时下方矩阵 RADAR_TIER3_INSTANT 行决定渠道"
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
          <p className="mb-1 text-xs text-slate-500">
            每格三态：<span className="font-medium">默认</span>{' '}
            走系统策略（推荐）·<span className="font-medium">开</span> 强制启用
            ·<span className="font-medium">关</span> 强制静音
          </p>
          <p className="mb-4 text-xs text-slate-400">
            全局开关 OFF 时整类静音；矩阵勾选不会越过全局开关
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">业务类型</th>
                  {CHANNELS.map((ch) => (
                    <th
                      key={ch.key}
                      className="w-32 px-2 py-2 text-center font-medium"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <ch.icon className="h-4 w-4" />
                        <span>{ch.label}</span>
                        {!ch.available && (
                          <span
                            className="text-[10px] text-slate-400"
                            title={ch.unavailableReason}
                          >
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
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {row.type === 'RADAR_TIER3_INSTANT' && (
                          <Star
                            className="h-3.5 w-3.5 text-amber-500"
                            aria-label="Tier 3"
                          />
                        )}
                        {row.label}
                      </div>
                      <div className="text-xs text-slate-500">{row.desc}</div>
                    </td>
                    {CHANNELS.map((ch) => {
                      const current = matrix[row.type]?.[ch.key] ?? null;
                      // R2 product P0：未启用渠道强制 unchecked，不读 server 残值
                      const renderValue: TriState = ch.available
                        ? current
                        : null;
                      return (
                        <td key={ch.key} className="px-2 py-3">
                          <TriStateSegmented
                            value={renderValue}
                            disabled={!ch.available}
                            disabledReason={ch.unavailableReason}
                            ariaLabel={`${row.label} - ${ch.label}`}
                            onChange={(v) => setChannelFor(row.type, ch.key, v)}
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
            该时段内即时推送（如 Tier 3
            即时推）静默；站内通知仍写入。时间按你的本地时区 (
            {Intl.DateTimeFormat().resolvedOptions().timeZone})。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="text-sm text-slate-700"
              htmlFor="quiet-hours-start"
            >
              从
            </label>
            <input
              id="quiet-hours-start"
              type="time"
              value={draft.quietHoursStart ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, quietHoursStart: e.target.value })
              }
              className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
            />
            <label className="text-sm text-slate-700" htmlFor="quiet-hours-end">
              到
            </label>
            <input
              id="quiet-hours-end"
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
            {draft.quietHoursStart &&
              draft.quietHoursEnd &&
              draft.quietHoursStart === draft.quietHoursEnd && (
                <span className="text-xs text-amber-600">
                  起止相同会被视为全天静默
                </span>
              )}
          </div>
        </section>

        {/* 渠道绑定状态（信息性） */}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            渠道状态
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 text-slate-500" />
                邮件
              </span>
              <span className="inline-flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                自动启用
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <Bell className="h-4 w-4 text-slate-500" />
                站内
              </span>
              <span className="inline-flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                自动启用
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                微信公众号
              </span>
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                未绑定（PR-DR3 启用）
              </span>
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
        aria-label={label}
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

interface TriStateSegmentedProps {
  value: TriState;
  disabled?: boolean;
  disabledReason?: string;
  ariaLabel: string;
  onChange: (v: TriState) => void;
}

// 三态 Segmented 控件：默认 / 开 / 关
function TriStateSegmented({
  value,
  disabled,
  disabledReason,
  ariaLabel,
  onChange,
}: TriStateSegmentedProps) {
  const options: Array<{
    key: 'default' | 'on' | 'off';
    label: string;
    v: TriState;
  }> = [
    { key: 'default', label: '默认', v: null },
    { key: 'on', label: '开', v: true },
    { key: 'off', label: '关', v: false },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      title={disabled ? disabledReason : ariaLabel}
      className={`inline-flex overflow-hidden rounded-md border border-slate-200 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.v)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-violet-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
