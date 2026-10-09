/**
 * MOSAIC — GM Login Page
 *
 * The only authentication UI for Game Masters.
 * There is NO registration flow — the GM account is pre-created by the organizer.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { useForm } from '../hooks/useGmLoginForm';
import { useAuth } from '../../../app/providers/AuthContext';
import { APP_CONFIG } from '../../../app/config/constants';

export default function GmLoginPage() {
  const navigate = useNavigate();
  const { status, loginGm } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'gm') {
      navigate('/gm/dashboard', { replace: true });
    }
  }, [status, navigate]);

  const { values, errors, handleChange, validate } = useForm({
    email: '',
    password: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return; // Prevent duplicate submit
    setErrorMessage(null);

    if (!validate()) return;

    setIsLoading(true);

    const result = await loginGm(values.email, values.password);

    setIsLoading(false);

    if (result.success) {
      navigate('/gm/dashboard', { replace: true });
    } else {
      setErrorMessage(result.error ?? 'Login failed. Please check your credentials.');
    }
  }

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-mosaic-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple shadow-lg shadow-mosaic-accent/30 mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{APP_CONFIG.name}</h1>
          <p className="text-mosaic-muted text-sm">{APP_CONFIG.tagline}</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-mosaic-accent">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Game Master Access</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-5" id="gm-login-form">
            {/* Email */}
            <div>
              <label htmlFor="gm-email" className="block text-sm font-medium text-mosaic-muted mb-1.5">
                Email Address
              </label>
              <input
                id="gm-email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="gm@example.com"
                className="w-full px-4 py-3 bg-mosaic-dark border border-mosaic-border rounded-xl text-white placeholder-mosaic-muted/50 focus:outline-none focus:ring-2 focus:ring-mosaic-accent focus:border-transparent transition-all"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="gm-password" className="block text-sm font-medium text-mosaic-muted mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="gm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={values.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-mosaic-dark border border-mosaic-border rounded-xl text-white placeholder-mosaic-muted/50 focus:outline-none focus:ring-2 focus:ring-mosaic-accent focus:border-transparent transition-all"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mosaic-muted hover:text-white transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-sm text-red-400">{errorMessage}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="gm-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-mosaic-accent/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-mosaic-muted">
            GM accounts are pre-configured by the event organizer.
            <br />
            No self-registration is available.
          </p>
        </div>
      </div>
    </div>
  );
}
