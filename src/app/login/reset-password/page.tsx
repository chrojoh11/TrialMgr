'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

function ResetPasswordForm() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handleRecoveryFlow = async () => {
      // Check URL parameters
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const searchParams = new URLSearchParams(window.location.search);

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = searchParams.get('code');
      const type = searchParams.get('type') ?? hashParams.get('type');

      console.log('Recovery flow check:', {
        type,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        hasCode: !!code,
      });

      // Supabase SSR uses PKCE and returns a one-time code in the query string.
      // Exchange it for the recovery session before displaying the password form.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (data.session && !error) {
          setReady(true);
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          setMessage('Invalid or expired reset link. Please request a new one.');
        }
        return;
      }

      // If we have access token in hash, manually set the session
      if (accessToken && refreshToken) {
        console.log('Found tokens in URL hash, setting session...');

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        console.log('Session set result:', { session: !!data.session, error });

        if (data.session) {
          setReady(true);
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          setMessage('Invalid or expired reset link. Please request a new one.');
        }
        return;
      }

      // Otherwise check for existing session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      console.log('Existing session check:', { session: !!session, error, type });

      if (session && type === 'recovery') {
        setReady(true);
      } else if (type === 'recovery') {
        setMessage('Reset link processing... If this persists, request a new link.');
      } else if (!session) {
        setMessage('Invalid or expired reset link. Please request a new one.');
      }
    };

    handleRecoveryFlow();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, 'Session:', !!session);

      if (event === 'PASSWORD_RECOVERY' || (session && event === 'INITIAL_SESSION')) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // First, verify we have a valid session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      console.log('Session check:', sessionData, sessionError); // Debug log

      if (sessionError || !sessionData.session) {
        setMessage('Session expired. Please request a new password reset link.');
        setLoading(false);
        return;
      }

      // Now update the password
      const { data, error } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      console.log('Update result:', data, error); // Debug log

      if (error) {
        console.error('Password update error:', error);
        setMessage(`Error: ${error.message}`);
        setLoading(false);
        return;
      }

      setMessage('✅ Password updated successfully! Redirecting...');

      // Sign out to clear the recovery session
      await supabase.auth.signOut();

      // Redirect to login
      setTimeout(() => router.replace('/login'), 2000);
    } catch (err) {
      console.error('Unexpected error:', err);
      setMessage('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="p-6 text-center">
        <p>{message || 'Verifying reset link...'}</p>
        {message && (
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-4 text-orange-600 underline hover:text-orange-700"
          >
            Return to sign in
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} className="space-y-4 max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold text-center">Reset Password</h1>

      <input
        type="password"
        placeholder="New Password"
        className="w-full p-2 border rounded"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 text-white py-2 rounded hover:bg-orange-700 disabled:bg-gray-400"
      >
        {loading ? 'Updating...' : 'Set New Password'}
      </button>

      {message && (
        <p
          className={`text-center ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}
        >
          {message}
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-center p-6">Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
