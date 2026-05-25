"use client";

// <SignedImage> — exibe imagens do Supabase Storage com tratamento de erro,
// skeleton de carregamento e fallback elegante.
//
// Para buckets PÚBLICOS (arts, brand-assets, onboarding-docs, contracts):
//   a URL já foi corrigida no upload — renderiza direto.
// Para buckets PRIVADOS (legal-docs):
//   chama /api/storage/signed-url para obter URL temporária (admin-only).
//
// NUNCA passar URL com http://supabase-kong-1 aqui — o upload-art/route.ts
// já garante URLs corretas a partir de agora. Registros antigos foram
// migrados pela query de 2026-05-13.

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

export type SignedImageProps = {
  /** URL completa (buckets públicos) ou path relativo (buckets privados). */
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  width?: number;
  height?: number;
  onError?: (err: Error) => void;
};

const DEFAULT_FALLBACK = (
  <div
    className="flex flex-col items-center justify-center gap-1 w-full h-full rounded-lg"
    style={{ background: "#1a1a2e" }}
  >
    <ImageIcon size={18} color="#6B7280" />
    <span className="text-[10px]" style={{ color: "#6B7280" }}>Sem imagem</span>
  </div>
);

export default function SignedImage({
  src,
  alt,
  className,
  fallback = DEFAULT_FALLBACK,
  width,
  height,
  onError,
}: SignedImageProps) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [retried, setRetried] = useState(false);

  // Reiniciar quando src mudar
  useEffect(() => {
    setStatus("loading");
    setRetried(false);
  }, [src]);

  if (!src) {
    return <>{fallback}</>;
  }

  function handleError() {
    if (!retried) {
      // Uma tentativa de reload (caso de URL expirada ou fluke de rede)
      setRetried(true);
      setStatus("loading");
      return;
    }
    const err = new Error(`SignedImage load failed: ${src}`);
    Sentry.captureException(err, { extra: { src, alt } });
    onError?.(err);
    setStatus("error");
  }

  if (status === "error") {
    return <>{fallback}</>;
  }

  return (
    <>
      {status === "loading" && (
        <div
          className={`animate-pulse rounded-lg ${className ?? ""}`}
          style={{ background: "#1A1F33", width, height }}
        />
      )}
      {/* img sempre presente para acionar load/error — oculta durante loading */}
      <img
        src={retried ? `${src}?r=${Date.now()}` : src}
        alt={alt}
        className={className}
        width={width}
        height={height}
        style={status === "loading" ? { display: "none" } : undefined}
        onLoad={() => setStatus("ok")}
        onError={handleError}
      />
    </>
  );
}
