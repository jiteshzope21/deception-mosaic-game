/**
 * MOSAIC — QR Scanner Component
 *
 * Uses @zxing/browser for camera-based QR scanning.
 * Falls back to manual text entry if camera is unavailable.
 */

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Camera, CameraOff, Keyboard } from 'lucide-react';

interface QrScannerProps {
  onScan: (qrCodeId: string) => void;
  disabled?: boolean;
}

const QR_PATTERN = /^QR-(0[1-9]|10)$/i;

export default function QrScanner({ onScan, disabled }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  // Start camera scanning
  useEffect(() => {
    if (mode !== 'camera' || disabled) return;

    let stopped = false;

    async function startCamera() {
      try {
        const reader = new BrowserQRCodeReader();
        readerRef.current = reader;

        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        if (devices.length === 0) {
          setCameraError('No camera found on this device.');
          setMode('manual');
          return;
        }

        // Prefer rear camera
        const rearCamera = devices.find(
          (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('environment')
        );
        const deviceId = rearCamera?.deviceId ?? devices[0]?.deviceId;

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, _error) => {
            if (stopped || !result) return;
            const text = result.getText().toUpperCase().trim();
            if (QR_PATTERN.test(text) && text !== lastScanned) {
              setLastScanned(text);
              // Debounce: Clear lastScanned after 3 seconds to allow re-scanning
              setTimeout(() => setLastScanned(null), 3000);
              onScan(text);
            }
          }
        );
        controlsRef.current = controls as any;
      } catch (err: any) {
        if (!stopped) {
          const msg = err?.message || 'Camera access denied or unavailable.';
          setCameraError(msg);
          setMode('manual');
        }
      }
    }

    void startCamera();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, disabled, onScan, lastScanned]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.toUpperCase().trim();
    if (!QR_PATTERN.test(code)) {
      setManualError('Enter a valid QR code like QR-01 through QR-10.');
      return;
    }
    setManualError(null);
    setManualCode('');
    onScan(code);
  }

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center py-10 bg-mosaic-dark/50 rounded-2xl border border-mosaic-border/50">
        <CameraOff className="w-10 h-10 text-mosaic-muted/40 mb-2" />
        <p className="text-mosaic-muted text-sm">Round ended — scanning disabled</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex bg-mosaic-dark rounded-xl p-1 gap-1 border border-mosaic-border">
        <button
          type="button"
          onClick={() => setMode('camera')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            mode === 'camera'
              ? 'bg-mosaic-accent/20 text-mosaic-accent border border-mosaic-accent/30'
              : 'text-mosaic-muted hover:text-white'
          }`}
        >
          <Camera className="w-4 h-4" />
          Camera
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            mode === 'manual'
              ? 'bg-mosaic-accent/20 text-mosaic-accent border border-mosaic-accent/30'
              : 'text-mosaic-muted hover:text-white'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          Manual
        </button>
      </div>

      {mode === 'camera' ? (
        <div className="relative overflow-hidden rounded-2xl bg-black aspect-video border border-mosaic-border">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <CameraOff className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-red-400 text-sm">{cameraError}</p>
              <button
                type="button"
                onClick={() => { setCameraError(null); setMode('manual'); }}
                className="mt-3 text-xs text-mosaic-muted underline"
              >
                Use manual entry instead
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 relative">
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-mosaic-accent rounded-tl-md" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-mosaic-accent rounded-tr-md" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-mosaic-accent rounded-bl-md" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-mosaic-accent rounded-br-md" />
                  {/* Scan line */}
                  <div className="absolute inset-x-2 top-0 h-0.5 bg-mosaic-accent/70 animate-scan-line" />
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/60">
                Point camera at a QR code
              </p>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <div>
            <label className="block text-mosaic-muted text-xs mb-1.5">Enter QR Code ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => { setManualCode(e.target.value.toUpperCase()); setManualError(null); }}
                placeholder="QR-01 through QR-10"
                maxLength={5}
                className="flex-1 bg-mosaic-dark border border-mosaic-border rounded-xl px-4 py-3 text-white text-sm font-mono uppercase placeholder:text-mosaic-muted/40 focus:outline-none focus:border-mosaic-accent transition-colors"
                autoFocus
              />
              <button
                type="submit"
                className="px-4 py-3 bg-mosaic-accent rounded-xl text-black font-semibold text-sm hover:bg-mosaic-accent/90 transition-colors"
              >
                Scan
              </button>
            </div>
            {manualError && (
              <p className="mt-1.5 text-xs text-red-400">{manualError}</p>
            )}
            <p className="mt-1.5 text-xs text-mosaic-muted/60">
              QR codes are labeled QR-01 through QR-10
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
