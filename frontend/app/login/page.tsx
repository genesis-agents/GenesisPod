'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';

type Mode = 'login' | 'register';

const COPY: Record<
  Mode,
  { title: string; submit: string; switchPrompt: string; switchAction: string }
> = {
  login: {
    title: 'Sign in',
    submit: 'Continue',
    switchPrompt: "Don't have an account?",
    switchAction: 'Create one',
  },
  register: {
    title: 'Create account',
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchAction: 'Sign in',
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

  const switchMode = () => {
    setError(null);
    setMode((m) => (m === 'login' ? 'register' : 'login'));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex justify-center">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="transition-opacity hover:opacity-80"
            aria-label="Go home"
          >
            <BrandLogo variant="full" subtitle={null} />
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-center text-2xl font-semibold text-gray-900">
            {copy.title}
          </h1>

          <button
            type="button"
            onClick={() => loginWithGoogle(email || undefined)}
            disabled={loading}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              className="h-[18px] w-[18px]"
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
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            OR
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              placeholder="Email"
            />

            {mode === 'register' && (
              <input
                type="text"
                required
                minLength={1}
                maxLength={50}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Username"
              />
            )}

            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 6}
              autoComplete={
                mode === 'register' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              placeholder="Password"
            />

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Please wait' : copy.submit}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {copy.switchPrompt}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-gray-900 hover:underline"
          >
            {copy.switchAction}
          </button>
        </p>
      </div>
    </div>
  );
}
