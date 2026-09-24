"use client";

import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { fotoPorPerfil } from "@/lib/equipe/fotos";
import { cn } from "@/lib/utils";

// Foto real do time (public/equipe/<primeiro-nome>.jpg); sem foto, cai no avatar escolhido no perfil.
export function FotoPessoa({ perfil, size = 32, className }: {
  perfil: { id: string; name?: string | null };
  size?: number;
  className?: string;
}) {
  const foto = fotoPorPerfil(perfil);
  if (!foto) return <MedievalAvatar type={getUserAvatar(perfil.id)} size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={foto}
      alt={perfil.name ?? ""}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full object-cover ring-2 ring-background", className)}
    />
  );
}
