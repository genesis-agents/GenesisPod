'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';

type Mode = 'login' | 'register';

const MODE_COPY: Record<
  Mode,
  {
    title: string;
    description: string;
    submit: string;
    alternate: string;
  }
> = {
  login: {
    title: '欢迎回来',
    description: '使用邮箱和密码登录，或继续跳转到 Google 认证。',
    submit: '使用邮箱和密码登录',
    alternate: '需要新账号？切换到注册',
  },
  register: {
    title: '创建账号',
    description: '先确认邮箱，再创建本地账号；同一个入口也支持继续走 Google。',
    submit: '创建账号',
    alternate: '已经有账号？切换到登录',
  },
};

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const copy = MODE_COPY[mode];
  const canUseGoogle = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url = `${config.streamApiUrl}/auth/${mode}`;
      const body =
        mode === 'login' ? { email, password } : { email, password, username };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || `${mode} failed`);
      }

      const { user, accessToken, refreshToken } = result.data;
      login(user, accessToken, refreshToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-6 py-8 lg:px-10">
        <div className="mb-12 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </button>

          <BrandLogo variant="full" subtitle={null} />
        </div>

        <div className="grid flex-1 items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
              Access
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-950">
              一个清晰的登录入口。
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              登录先进入站内页面，再决定走本地密码还是
              Google。流程统一，适合本地调试，也适合正式环境。
            </p>
          </section>

          <section className="flex justify-end">
            <div className="w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-10">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                    {copy.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {copy.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`rounded-xl px-4 py-2 font-medium transition ${
                      mode === 'login'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`rounded-xl px-4 py-2 font-medium transition ${
                      mode === 'register'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    注册
                  </button>
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                先输入邮箱，再选择认证方式。点击 Google
                时，会把当前邮箱作为登录提示。
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Field label="邮箱">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="you@company.com"
                  />
                </Field>

                {mode === 'register' && (
                  <Field label="用户名">
                    <input
                      type="text"
                      required
                      minLength={1}
                      maxLength={50}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      placeholder="local_admin"
                    />
                  </Field>
                )}

                <Field
                  label="密码"
                  hint={
                    mode === 'register'
                      ? '本地注册密码至少 8 位，且需要包含大写、小写和数字。'
                      : undefined
                  }
                >
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder={
                      mode === 'register'
                        ? '至少 8 位，包含大小写和数字'
                        : '输入你的密码'
                    }
                  />
                </Field>

                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {loading ? '处理中...' : copy.submit}
                  </button>

                  <button
                    type="button"
                    onClick={() => loginWithGoogle(email)}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    {canUseGoogle
                      ? `使用 Google 继续 (${email})`
                      : '使用 Google 继续'}
                  </button>
                </div>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-500">
                <button
                  type="button"
                  onClick={() =>
                    setMode((current) =>
                      current === 'login' ? 'register' : 'login'
                    )
                  }
                  className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4"
                >
                  {copy.alternate}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint ? <p className="text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}
