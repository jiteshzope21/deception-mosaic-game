/**
 * MOSAIC — Loading Screen Component
 * Dark sci-fi arcade radar initialization
 */
import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'INITIALIZING SYSTEM...' }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-[#06070a] flex flex-col items-center justify-center gap-5 p-4 arcade-corridor-bg relative overflow-hidden select-none">
      {/* Background scanline glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,30,66,0.06)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-tactical-slate border border-neon-red/50 flex items-center justify-center shadow-[0_0_25px_rgba(255,30,66,0.35)]">
          <span className="text-neon-red font-display text-3xl font-bold tracking-widest">D</span>
        </div>
        <div className="absolute -inset-1 rounded-2xl bg-neon-red opacity-25 blur-sm animate-pulse" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5 text-bone-cream font-arcade tracking-widest text-xs uppercase">
          <Loader2 className="w-4 h-4 animate-spin text-neon-red" />
          <span>{message}</span>
        </div>
        <p className="text-[10px] font-arcade tracking-widest text-muted-steel uppercase">
          MOSAIC // DECEPTION PROTOCOL
        </p>
      </div>
    </div>
  );
}
