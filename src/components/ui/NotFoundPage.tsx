/**
 * MOSAIC — 404 Not Found Page
 */
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center gap-6 p-4">
      <MapPin className="w-16 h-16 text-mosaic-muted" />
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-mosaic-muted">This page doesn't exist.</p>
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
