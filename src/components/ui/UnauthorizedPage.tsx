/**
 * MOSAIC — Unauthorized Page
 * Dark sci-fi tactical access denied
 */
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[#06070a] flex flex-col items-center justify-center gap-6 p-4 arcade-corridor-bg relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,30,66,0.08)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-tactical-slate border border-neon-red/60 flex items-center justify-center shadow-[0_0_30px_rgba(255,30,66,0.4)]">
          <ShieldAlert className="w-10 h-10 text-neon-red" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-md relative z-10">
        <span className="text-xs font-arcade text-neon-red tracking-widest uppercase">
          SECURITY BREACH // CLEARANCE LEVEL 0
        </span>
        <h1 className="text-5xl font-display uppercase tracking-widest text-bone-cream">
          ACCESS DENIED
        </h1>
        <p className="text-muted-steel text-sm leading-relaxed">
          Your operative credentials do not possess the required clearance for this security partition.
        </p>
      </div>

      <Link
        to="/"
        className="relative z-10 flex items-center gap-2 px-6 py-3 bg-neon-red text-white font-bold tracking-wider rounded-xl hover:brightness-110 shadow-[0_0_15px_rgba(255,30,66,0.35)] transition-all uppercase text-xs font-arcade"
      >
        <ArrowLeft className="w-4 h-4" />
        RETURN TO TERMINAL
      </Link>
    </div>
  );
}
