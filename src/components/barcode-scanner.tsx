"use client";

import { useEffect, useRef, useState } from "react";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf"];

function getDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * Leitura de código de barras pela câmera.
 * Usa a API nativa do navegador (disponível no Chrome do Android). Onde não
 * houver suporte, o botão nem aparece e a digitação continua funcionando.
 */
export function BarcodeScannerButton({
  onDetect, label = "Ler código",
}: { onDetect: (code: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(Boolean(getDetector()) && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let frame = 0;

    (async () => {
      try {
        const Detector = getDetector();
        if (!Detector) throw new Error("Câmera não suportada neste navegador.");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new Detector({ formats: FORMATS });
        const tick = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              onDetect(codes[0].rawValue);
              close();
              return;
            }
          } catch {
            /* quadro sem código: segue tentando */
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => { setOpen(false); setError(null); };

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost btn-sm shrink-0"
        aria-label={label || "Ler código de barras com a câmera"}
      >
        📷{label ? ` ${label}` : ""}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="font-semibold">Aponte para o código de barras</span>
            <button type="button" onClick={close} className="rounded-lg px-3 py-2 font-bold">Fechar</button>
          </div>
          <div className="relative flex-1">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-banana-400" />
          </div>
          {error && <p className="bg-red-600 px-4 py-3 text-sm font-semibold text-white">{error}</p>}
        </div>
      )}
    </>
  );
}
