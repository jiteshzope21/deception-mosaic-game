/**
 * MOSAIC — 404 Not Found Page
 * Dark sci-fi tactical sector lost
 */
import { RadioTower, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#06070a] flex flex-col items-center justify-center gap-6 p-4 arcade-corridor-bg relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,229,255,0.06)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-tactical-slate border border-electric-cyan/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.3)]">
          <RadioTower className="w-10 h-10 text-electric-cyan" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-md relative z-10">
        <span className="text-xs font-arcade text-electric-cyan tracking-widest uppercase">
          RADAR ANOMALY // 404 SIGNAL LOST
        </span>
        <h1 className="text-5xl font-display uppercase tracking-widest text-bone-cream">
          SECTOR UNREACHABLE
        </h1>
        <p className="text-muted-steel text-sm leading-relaxed">
          The requested coordinate does not exist in the active facility manifest or has been expunged.
        </p>
      </div>

      <Link
        to="/"
        className="relative z-10 flex items-center gap-2 px-6 py-3 bg-elevated-panel border border-electric-cyan/40 text-electric-cyan font-bold tracking-wider rounded-xl hover:bg-electric-cyan/10 shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all uppercase text-xs font-arcade"
      >
        <ArrowLeft className="w-4 h-4" />
        RETURN TO TERMINAL
      </Link>
    </div>
  );
}
