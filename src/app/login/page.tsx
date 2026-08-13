'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    if (data?.user) {
      router.push('/dashboard');
    }
  };

  const handlePasswordReset = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');

    if (!email) {
      setError('Please enter your email above first.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/reset-password`,
    });

    if (error) {
      console.error(error);
      setError('Error sending reset email.');
    } else {
      setResetMessage('Check your email for a password reset link.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-sm w-full space-y-8">
        <div className="bg-white p-6 sm:p-8 border rounded-lg shadow-lg">
          <h1 className="text-xl sm:text-2xl font-bold mb-1 text-center">SDDA TrialDesk</h1>
          <p className="mb-4 text-center text-sm text-gray-600">Secretary sign in</p>

          {error && (
            <p className="mb-3 text-red-600 text-sm border border-red-300 p-3 rounded bg-red-50">
              {error}
            </p>
          )}

          {resetMessage && (
            <p className="mb-3 text-green-600 text-sm border border-green-300 p-3 rounded bg-green-50">
              {resetMessage}
            </p>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full border border-gray-300 p-3 sm:p-2 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                className="w-full border border-gray-300 p-3 sm:p-2 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-orange-600 text-white p-3 rounded-lg hover:bg-orange-700 transition-colors font-medium min-h-[44px] text-base"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={handlePasswordReset}
              className="w-full text-sm text-orange-600 underline hover:text-orange-700 transition-colors min-h-[44px]"
            >
              Forgot your password?
            </button>

            <div className="text-center mt-6 pt-6 border-t">
              <a
                href="/register"
                className="text-orange-600 hover:text-orange-700 hover:underline transition-colors text-sm sm:text-base"
              >
                Need an account? Register here
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
