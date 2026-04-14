"use client";

import { useState } from "react";

export type AvatarType = "knight" | "archer" | "mage" | "king" | "queen" | "shield";

interface AvatarProps {
  type: AvatarType;
  size?: number;
  className?: string;
  glow?: boolean;
}

// Avatar image paths (PNG in /public/avatars/)
// Fallback to initials if image not found
const AVATAR_IMAGES: Record<AvatarType, string> = {
  knight: "/avatars/knight.png",
  archer: "/avatars/archer.png",
  mage: "/avatars/mage.png",
  king: "/avatars/king.png",
  queen: "/avatars/queen.png",
  shield: "/avatars/shield.png",
};

const AVATAR_FALLBACK_COLORS: Record<AvatarType, string> = {
  knight: "#0d4af5",
  archer: "#3b6ff5",
  mage: "#8b5cf6",
  king: "#f59e0b",
  queen: "#f59e0b",
  shield: "#0d4af5",
};

export const AVATAR_OPTIONS: { type: AvatarType; label: string; adminOnly?: boolean }[] = [
  { type: "king", label: "Rei", adminOnly: true },
  { type: "queen", label: "Rainha", adminOnly: true },
  { type: "knight", label: "Cavaleiro" },
  { type: "archer", label: "Arqueiro" },
  { type: "mage", label: "Mago" },
  { type: "shield", label: "Escudo LM" },
];

export default function MedievalAvatar({ type, size = 40, className, glow = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const src = AVATAR_IMAGES[type] ?? AVATAR_IMAGES.shield;
  const fallbackColor = AVATAR_FALLBACK_COLORS[type] ?? "#0d4af5";

  return (
    <div
      className={`relative rounded-xl overflow-hidden flex items-center justify-center transition-all ${
        glow ? "shadow-[0_0_16px_rgba(13,74,245,0.3)] hover:shadow-[0_0_24px_rgba(13,74,245,0.5)]" : ""
      } ${className ?? ""}`}
      style={{ width: size, height: size, background: "#0a0a0e" }}
    >
      {!imgError ? (
        <img
          src={src}
          alt={type}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        // Fallback: colored circle with initials
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: `${fallbackColor}15` }}
        >
          <span style={{ color: fallbackColor, fontSize: size * 0.35, fontWeight: 700 }}>
            {type === "king" ? "👑" : type === "queen" ? "👑" : type === "knight" ? "⚔️" : type === "archer" ? "🏹" : type === "mage" ? "🧙" : "LM"}
          </span>
        </div>
      )}

      {/* Neon border glow on hover */}
      <div className="absolute inset-0 rounded-xl border border-white/[0.06] hover:border-[#0d4af5]/30 transition-all pointer-events-none" />
    </div>
  );
}

// ─── Avatar Storage ────────────────────────────────────────
const AVATAR_STORAGE_KEY = "lone-os-avatars";

export function getUserAvatar(userId: string): AvatarType {
  try {
    const stored = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) ?? "{}");
    return stored[userId] ?? "shield";
  } catch { return "shield"; }
}

export function setUserAvatar(userId: string, avatar: AvatarType) {
  try {
    const stored = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) ?? "{}");
    stored[userId] = avatar;
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
}

// ─── Small inline avatar for lists/kanban ──────────────────
export function AvatarBadge({ userId, size = 28 }: { userId: string; size?: number }) {
  const type = getUserAvatar(userId);
  return <MedievalAvatar type={type} size={size} glow />;
}
