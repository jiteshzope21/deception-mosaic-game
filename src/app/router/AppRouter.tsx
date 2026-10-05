/**
 * MOSAIC — Application Router
 *
 * Route definitions and protected route wrappers.
 *
 * Route structure:
 *   /                      → Landing / game code entry (Player)
 *   /join                  → Player name selection after code entry
 *   /player/*              → Protected player routes (anonymous auth)
 *   /gm/login              → GM login page
 *   /gm/*                  → Protected GM routes (email auth + gm_profiles check)
 *   /unauthorized          → Generic unauthorized page
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext';
import LoadingScreen from '../../components/ui/LoadingScreen';

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────

const LandingPage = React.lazy(() => import('../../features/player/pages/LandingPage'));
const JoinPage = React.lazy(() => import('../../features/player/pages/JoinPage'));
const PlayerLobbyPage = React.lazy(() => import('../../features/player/pages/PlayerLobbyPage'));
const Round1PlayerPage = React.lazy(() => import('../../features/player/pages/Round1PlayerPage'));
const Round1CompletePage = React.lazy(() => import('../../features/player/pages/Round1CompletePage'));
const GmLoginPage = React.lazy(() => import('../../features/auth/pages/GmLoginPage'));
const GmDashboardPage = React.lazy(() => import('../../features/gm/pages/GmDashboardPage'));
const UnauthorizedPage = React.lazy(() => import('../../components/ui/UnauthorizedPage'));
const NotFoundPage = React.lazy(() => import('../../components/ui/NotFoundPage'));

// ─── Route Guards ─────────────────────────────────────────────────────────────

/** Renders children only if user is authenticated as GM, otherwise redirects. */
function GmRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen message="Verifying access..." />;
  if (status === 'gm') return <>{children}</>;

  // Redirect to GM login, preserving the intended destination
  return <Navigate to="/gm/login" replace />;
}

/** Renders children only if user is authenticated as Player, otherwise redirects. */
function PlayerRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen message="Loading..." />;
  if (status === 'player') return <>{children}</>;

  // Not a player — send back to landing
  return <Navigate to="/" replace />;
}

/** Redirects already-authenticated users away from auth pages. */
function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen message="Loading..." />;
  if (status === 'gm') return <Navigate to="/gm/dashboard" replace />;
  if (status === 'player') return <Navigate to="/player/lobby" replace />;

  return <>{children}</>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen message="Loading..." />}>
        <Routes>
          {/* ── Public routes ── */}
          <Route
            path="/"
            element={
              <RedirectIfAuthenticated>
                <LandingPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/join"
            element={
              <RedirectIfAuthenticated>
                <JoinPage />
              </RedirectIfAuthenticated>
            }
          />

          {/* ── GM routes ── */}
          <Route
            path="/gm/login"
            element={
              <RedirectIfAuthenticated>
                <GmLoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/gm/dashboard"
            element={
              <GmRoute>
                <GmDashboardPage />
              </GmRoute>
            }
          />
          {/* Future GM routes added in Phase 2+ */}
          <Route path="/gm" element={<Navigate to="/gm/dashboard" replace />} />

          {/* ── Player routes ── */}
          <Route
            path="/player/lobby"
            element={
              <PlayerRoute>
                <PlayerLobbyPage />
              </PlayerRoute>
            }
          />
          <Route
            path="/player/round1"
            element={
              <PlayerRoute>
                <Round1PlayerPage />
              </PlayerRoute>
            }
          />
          <Route
            path="/player/round1-complete"
            element={
              <PlayerRoute>
                <Round1CompletePage />
              </PlayerRoute>
            }
          />
          <Route path="/player" element={<Navigate to="/player/lobby" replace />} />

          {/* ── Utility routes ── */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
