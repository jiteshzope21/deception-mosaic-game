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
    <div className="min-h-screen arcade-corridor-bg text-bone-cream relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Background grid texture */}
      <div className="absolute inset-0 arcade-grid opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-md z-10 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-tactical-slate/90 border border-steel-border/80 rounded-full text-[11px] font-arcade tracking-widest text-muted-steel uppercase mb-2">
            <span>ADG</span>
            <span className="text-neon-red">✕</span>
            <span>MOSAIC</span>
            <span className="w-1 h-1 rounded-full bg-neon-red animate-ping" />
          </div>

          <h1 className="text-5xl sm:text-6xl font-display uppercase tracking-wider text-bone-cream drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
            GAME MASTER
          </h1>
          <p className="text-xs font-arcade tracking-[0.25em] text-neon-red uppercase">
            COMMAND & CONTROL ACCESS
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-corridor/90 border border-steel-border rounded-lg text-xs font-arcade text-electric-cyan">
            <Shield className="w-3.5 h-3.5 text-electric-cyan" />
            <span className="tracking-wider">SECURITY LEVEL 5 TERMINAL</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="arcade-card p-6 sm:p-8 border-glow-red relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-neon-red/10 rounded-full blur-2xl pointer-events-none" />

          <h2 className="text-lg font-arcade uppercase font-bold text-bone-cream tracking-wider mb-6 flex items-center justify-between border-b border-steel-border pb-3">
            <span>AUTHENTICATE</span>
            <span className="text-[10px] text-muted-steel">SECURE UPLINK</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5" id="gm-login-form">
            {/* Email */}
            <div>
              <label htmlFor="gm-email" className="block text-xs font-arcade uppercase tracking-wider text-muted-steel mb-1.5">
                OPERATIVE IDENTIFIER (EMAIL)
              </label>
              <input
                id="gm-email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="gm@mosaic.event"
                className="arcade-input text-bone-cream placeholder:text-muted-steel/40"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-neon-red font-tech">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="gm-password" className="block text-xs font-arcade uppercase tracking-wider text-muted-steel mb-1.5">
                AUTHORIZATION CIPHER
              </label>
              <div className="relative">
                <input
                  id="gm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={values.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••••••"
                  className="arcade-input pr-12 text-bone-cream placeholder:text-muted-steel/40 font-mono"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-steel hover:text-bone-cream transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-neon-red font-tech">{errors.password}</p>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl">
                <p className="text-xs text-neon-red font-tech">{errorMessage}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="gm-login-submit"
              type="submit"
              disabled={isLoading}
              className="arcade-btn-primary w-full py-3.5 text-xs font-arcade uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AUTHENTICATING...
                </>
              ) : (
                'INITIALIZE COMMAND SESSION'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-steel/80 font-tech">
            GM accounts are provisioned exclusively for event supervisors.
            <br />
            Unauthorized breach attempts will be recorded in the audit trail.
          </p>
        </div>
      </div>
    </div>
  );
}
