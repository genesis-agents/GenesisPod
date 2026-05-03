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
    title: 'Welcome back',
    description:
      'Use your email and password, or continue with Google after confirming your email.',
    submit: 'Continue with email',
    alternate: 'Need an account?',
  },
  register: {
    title: 'Create account',
    description:
      'Set up a local account with email first. The same entry also supports Google.',
    submit: 'Create account',
    alternate: 'Back to login',
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
    <div className="min-h-screen bg-[#f7f4ed] text-[#18181b]">
      <div className="mx-auto flex min-h-screen max-w-[1380px] flex-col px-8 py-10 lg:px-12">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-white/80 px-4 py-2 text-sm font-medium text-[#5f5a52] transition hover:border-[#c9c1b3] hover:text-[#18181b]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <BrandLogo variant="full" subtitle={null} />
        </div>

        <div className="grid flex-1 items-center gap-10 pt-10 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="flex flex-col justify-center lg:pl-8">
            <div className="max-w-[460px]">
              <p className="text-sm font-medium tracking-[0.18em] text-[#8a8478]">
                GENESIS ACCESS
              </p>
              <h1 className="font-serif mt-6 text-[56px] leading-[1.02] tracking-[-0.04em] text-[#18181b] md:text-[72px]">
                Think clearly,
                <br />
                sign in simply
              </h1>
              <p className="mt-5 text-lg leading-8 text-[#615b51]">
                Stay on-site first. Confirm the email. Then continue with local
                password or Google.
              </p>
            </div>

            <div className="bg-white/72 mt-10 w-full max-w-[420px] rounded-[28px] border border-[#e2dbcf] p-5 shadow-[0_18px_50px_rgba(38,33,28,0.05)] backdrop-blur">
              <button
                type="button"
                onClick={() => loginWithGoogle(email)}
                className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[#ddd7cc] bg-white text-base font-medium text-[#18181b] transition hover:bg-[#faf8f2]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
                  ? `Continue with Google (${email})`
                  : 'Continue with Google'}
              </button>

              <div className="my-4 text-center text-sm tracking-[0.18em] text-[#8a8478]">
                OR
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 w-full rounded-2xl border border-[#ddd7cc] bg-white px-4 text-base text-[#18181b] outline-none transition placeholder:text-[#a19a8d] focus:border-[#bfb7a9] focus:ring-4 focus:ring-[#f0ebe1]"
                    placeholder="Enter your email"
                  />
                </Field>

                {mode === 'register' && (
                  <Field label="Username">
                    <input
                      type="text"
                      required
                      minLength={1}
                      maxLength={50}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-14 w-full rounded-2xl border border-[#ddd7cc] bg-white px-4 text-base text-[#18181b] outline-none transition placeholder:text-[#a19a8d] focus:border-[#bfb7a9] focus:ring-4 focus:ring-[#f0ebe1]"
                      placeholder="Choose a username"
                    />
                  </Field>
                )}

                <Field
                  label="Password"
                  hint={
                    mode === 'register'
                      ? 'At least 8 characters with upper, lower, and number.'
                      : undefined
                  }
                >
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 w-full rounded-2xl border border-[#ddd7cc] bg-white px-4 text-base text-[#18181b] outline-none transition placeholder:text-[#a19a8d] focus:border-[#bfb7a9] focus:ring-4 focus:ring-[#f0ebe1]"
                    placeholder="Enter your password"
                  />
                </Field>

                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[#18181b] px-4 text-base font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#8e8a83]"
                >
                  {loading ? 'Processing...' : copy.submit}
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between text-sm text-[#736d63]">
                <div className="inline-flex rounded-full border border-[#e4ded3] bg-[#faf8f2] p-1">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`rounded-full px-3 py-1.5 transition ${
                      mode === 'login'
                        ? 'bg-white text-[#18181b] shadow-sm'
                        : 'text-[#8a8478]'
                    }`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`rounded-full px-3 py-1.5 transition ${
                      mode === 'register'
                        ? 'bg-white text-[#18181b] shadow-sm'
                        : 'text-[#8a8478]'
                    }`}
                  >
                    注册
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setMode((current) =>
                      current === 'login' ? 'register' : 'login'
                    )
                  }
                  className="font-medium text-[#18181b] underline decoration-[#cfc7ba] underline-offset-4"
                >
                  {copy.alternate}
                </button>
              </div>
            </div>
          </section>

          <section className="hidden h-full min-h-[760px] items-center justify-center rounded-[34px] border border-[#e2dbcf] bg-[#fbf9f4] px-14 py-16 lg:flex">
            <div className="max-w-[560px] text-center">
              <BrandLogo
                variant="full"
                subtitle={null}
                className="justify-center"
              />
              <p className="font-serif mt-14 text-[68px] leading-[1.04] tracking-[-0.045em] text-[#18181b]">
                A unified entry
                <br />
                for local admins
                <br />
                and Google users
              </p>
              <p className="mt-8 text-base leading-7 text-[#6e685d]">
                Email first, then local password or Google OAuth, without
                pushing the user to a third-party screen too early.
              </p>
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
      <label className="text-sm font-medium text-[#4f4a43]">{label}</label>
      {children}
      {hint ? <p className="text-xs leading-5 text-[#7a7469]">{hint}</p> : null}
    </div>
  );
}
