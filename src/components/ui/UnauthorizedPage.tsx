/**
 * MOSAIC — Unauthorized Page
 */
import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center gap-6 p-4">
      <ShieldX className="w-16 h-16 text-red-500" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Unauthorized</h1>
        <p className="text-mosaic-muted">You don't have permission to access this page.</p>
      </div>
      <Link
        to="/"
        className="px-6 py-2 bg-mosaic-accent text-white rounded-lg font-medium hover:bg-mosaic-accent/80 transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
