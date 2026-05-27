'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, ShieldCheck, Sparkles, Stars } from 'lucide-react';
import { BrandLogo } from '@/components/common/brand/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';

type Mode = 'login' | 'register';

const COPY: Record<
  Mode,
  {
    title: string;
    subtitle: string;
    submit: string;
    switchPrompt: string;
    switchAction: string;
    passwordHint: string;
  }
> = {
  login: {
    title: 'Welcome back',
    subtitle:
      'Sign in to continue your workspace, saved conversations, and team drafts.',
    submit: 'Continue',
    switchPrompt: "Don't have an account?",
    switchAction: 'Create one',
    passwordHint: 'Use your account password to continue securely.',
  },
  register: {
    title: 'Create your account',
    subtitle:
      'Set up your workspace in minutes and keep your drafts, runs, and team context in one place.',
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchAction: 'Sign in',
    passwordHint: 'Use at least 8 characters so your account starts protected.',
  },
};

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: 'Cleaner first impression',
    body: 'Centered auth card, softer background light, stronger spacing hierarchy.',
  },
  {
    icon: ShieldCheck,
    title: 'Trust without clutter',
    body: 'Supportive copy and clearer states make the page feel more reliable.',
  },
  {
    icon: Stars,
    title: 'Production-ready direction',
    body: 'This is the closest to your reference and the easiest to scale across auth flows.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const copy = COPY[mode];

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

  const switchMode = (nextMode?: Mode) => {
    setError(null);
    setMode((current) =>
      nextMode ?? (current === 'login' ? 'register' : 'login')
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef5ff_0%,#fff8f1_100%)] text-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8%] top-[-8%] h-[320px] w-[320px] rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-6%] h-[280px] w-[280px] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute left-1/2 top-[18%] h-[220px] w-[220px] -translate-x-1/2 rounded-full bg-white/35 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
          <section className="hidden lg:grid lg:gap-6">
            <div className="inline-flex w-fit items-center rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm backdrop-blur">
              Auth Experience
            </div>

            <div className="max-w-2xl">
              <h1 className="text-6xl font-semibold tracking-[-0.07em] text-slate-950 xl:text-7xl">
                Friendlier authentication, without losing clarity.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
                I picked the `Halo` direction for implementation. It keeps the calm,
                centered auth card you liked from ChatGPT, but makes the page warmer,
                more polished, and easier to trust at first glance.
              </p>
            </div>

            <div className="grid max-w-2xl gap-3">
              {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="grid grid-cols-[56px_1fr] gap-4 rounded-[24px] border border-slate-200/70 bg-white/55 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] backdrop-blur"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {title}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-[540px]">
            <div className="rounded-[32px] border border-white/70 bg-white/78 p-3 shadow-[0_28px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="rounded-[28px] bg-white/92 p-5 sm:p-7">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="transition-opacity hover:opacity-80"
                    aria-label="Go home"
                  >
                    <BrandLogo variant="full" subtitle={null} />
                  </button>

                  <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:block">
                    {mode === 'login' ? 'Secure sign in' : 'New account'}
                  </div>
                </div>

                <div className="mb-6 grid w-full grid-cols-2 rounded-[18px] bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`h-11 rounded-2xl text-sm font-semibold transition ${
                      mode === 'login'
                        ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`h-11 rounded-2xl text-sm font-semibold transition ${
                      mode === 'register'
                        ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <div className="mb-6">
                  <h2 className="text-[34px] font-semibold tracking-[-0.05em] text-slate-950 sm:text-[42px]">
                    {copy.title}
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {copy.subtitle}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loginWithGoogle(email || undefined)}
                  disabled={loading}
                  className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-5 text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
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
                  Continue with Google
                </button>

                <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  <span className="h-px bg-slate-200" />
                  <span>Or</span>
                  <span className="h-px bg-slate-200" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid gap-3">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Email
                      </span>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                        placeholder="you@example.com"
                      />
                    </label>

                    {mode === 'register' && (
                      <label className="grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Username
                        </span>
                        <input
                          type="text"
                          required
                          minLength={1}
                          maxLength={50}
                          autoComplete="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                          placeholder="How your team will see you"
                        />
                      </label>
                    )}

                    <label className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Password
                        </span>
                        {mode === 'login' && (
                          <Link
                            href="/"
                            className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
                          >
                            Need help?
                          </Link>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        minLength={mode === 'register' ? 8 : 6}
                        autoComplete={
                          mode === 'register' ? 'new-password' : 'current-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                        placeholder={
                          mode === 'register'
                            ? 'Create a strong password'
                            : 'Enter your password'
                        }
                      />
                    </label>
                  </div>

                  <div className="rounded-[20px] bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
                    {copy.passwordHint}
                  </div>

                  {error && (
                    <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-[15px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{loading ? 'Please wait' : copy.submit}</span>
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                  {copy.switchPrompt}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode()}
                    className="font-semibold text-slate-900 transition hover:underline"
                  >
                    {copy.switchAction}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
