import { useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, sendResetEmail } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { friendlyAuthError } from '../lib/firebaseErrors';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const RESET_COOLDOWN_MS = 60_000;

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  const showError = (msg: string) => {
    setError(msg);
    queueMicrotask(() => errorRef.current?.focus());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSent(false);

    const now = Date.now();
    if (now < lockedUntil) {
      const secs = Math.ceil((lockedUntil - now) / 1000);
      showError(`Too many attempts. Please wait ${secs} seconds.`);
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAttempts(0);
    } catch (err: unknown) {
      const next = attempts + 1;
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setAttempts(0);
        showError('Too many failed attempts. Please wait 30 seconds.');
      } else {
        setAttempts(next);
        showError(friendlyAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resetCooldown) return;
    if (!email.trim()) {
      showError('Enter your email first, then click Forgot Password.');
      return;
    }
    setError('');
    setResetSent(false);
    try {
      await sendResetEmail(email.trim());
      setResetSent(true);
      setResetCooldown(true);
      setTimeout(() => setResetCooldown(false), RESET_COOLDOWN_MS);
    } catch {
      showError('Could not send reset email. Check the address and try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center mb-6">
          <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="R&B Power" className="h-12 mb-4" />
          <p className="text-sm text-[#7A756E] text-center">
            No amount of power is out of reach.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#201F1E] mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#201F1E] mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#D8D5D0] px-3 py-2 pr-10 text-sm outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A756E] hover:text-[#201F1E] transition"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z" clipRule="evenodd" />
                    <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="text-sm text-[#ED202B] bg-red-50 rounded-lg px-3 py-2 outline-none"
            >
              {error}
            </p>
          )}

          {resetSent && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              Password reset email sent. Check your inbox.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] py-2.5 text-sm font-semibold transition disabled:opacity-60"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetCooldown}
            className="w-full text-center text-sm text-[#7A756E] hover:text-[#ED202B] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetCooldown ? 'Reset email sent — check your inbox' : 'Forgot Password?'}
          </button>
        </form>
      </div>
    </div>
  );
}
