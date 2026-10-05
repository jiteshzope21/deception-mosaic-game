/**
 * MOSAIC — Loading Screen Component
 */
import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple flex items-center justify-center shadow-lg shadow-mosaic-accent/30">
          <span className="text-white font-bold text-xl tracking-wider">M</span>
        </div>
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple opacity-20 blur-sm animate-pulse" />
      </div>
      <div className="flex items-center gap-3 text-mosaic-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
