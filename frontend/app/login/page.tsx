'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    description:
      '先输入邮箱。你可以继续使用密码登录，也可以跳转到 Google 认证。',
    submit: '使用邮箱和密码登录',
    alternate: '需要新账号？切换到注册',
  },
  register: {
    title: '创建你的工作台',
    description: '用邮箱创建本地账号，或先确认邮箱后继续走 Google 登录。',
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.22),_transparent_28%),linear-gradient(135deg,_#f7f2e8_0%,_#f4f0ea_45%,_#ebe5da_100%)] text-stone-900">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="flex flex-col justify-between rounded-[2rem] border border-stone-300/70 bg-stone-950 px-8 py-10 text-stone-100 shadow-[0_30px_80px_rgba(41,37,36,0.28)] lg:px-10">
          <div className="space-y-8">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm tracking-[0.2em] text-stone-200/90">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              GENESIS.AI ACCESS
            </div>

            <div className="space-y-5">
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
                一个入口，接住本地调试、管理员登录和 Google 认证。
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
                先给出邮箱，再决定走密码还是
                Google。这样本地环境和正式环境共用同一套入口，不需要让用户猜下一步该点哪里。
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">
                Email First
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-200">
                Google 按钮会把你输入的邮箱作为登录提示，减少选错账号。
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">
                Local Admin
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-200">
                本地环境可以直接走邮箱密码，不依赖外部 OAuth
                成功后才能进入后台。
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">
                Same Entry
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-200">
                登录和注册保留在同一页，减少跳转，也更适合之后继续加企业 SSO。
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[2rem] border border-stone-300/80 bg-white/90 p-8 shadow-[0_24px_60px_rgba(120,113,108,0.18)] backdrop-blur xl:p-10">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-amber-700">
                  Access
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                  {copy.title}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
                  {copy.description}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    mode === 'login'
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    mode === 'register'
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  注册
                </button>
              </div>
            </div>

            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <p className="font-medium">先输入邮箱，再选择认证方式。</p>
              <p className="mt-1 leading-6 text-amber-800">
                如果你点 Google，系统会把当前邮箱作为 Google
                登录提示。这样同一个入口既能服务普通用户，也能兼容本地管理员登录。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700">
                  邮箱
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                  placeholder="you@company.com"
                />
              </div>

              {mode === 'register' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    用户名
                  </label>
                  <input
                    type="text"
                    required
                    minLength={1}
                    maxLength={50}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                    placeholder="local_admin"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700">
                  密码
                </label>
                <input
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                  placeholder={
                    mode === 'register'
                      ? '至少 8 位，包含大小写和数字'
                      : '输入你的密码'
                  }
                />
                {mode === 'register' && (
                  <p className="text-xs leading-5 text-stone-500">
                    本地注册密码至少 8 位，且需要包含大写、小写和数字。
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {loading ? '处理中...' : copy.submit}
                </button>

                <button
                  type="button"
                  onClick={() => loginWithGoogle(email)}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-800 transition hover:border-stone-400 hover:bg-stone-50"
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

            <div className="mt-6 border-t border-stone-200 pt-5 text-sm text-stone-500">
              <button
                type="button"
                onClick={() =>
                  setMode((current) =>
                    current === 'login' ? 'register' : 'login'
                  )
                }
                className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-4"
              >
                {copy.alternate}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
