"use client";

import { useState } from "react";

export type AvatarType = "knight" | "archer" | "mage" | "king" | "queen" | "shield" | "dragon" | "orc" | "rogue" | "smith" | "golem";

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
  dragon: "/avatars/dragon.png",
  orc: "/avatars/orc.png",
  rogue: "/avatars/rogue.png",
  smith: "/avatars/smith.png",
  golem: "/avatars/golem.png",
};

const AVATAR_FALLBACK: Record<AvatarType, { emoji: string; color: string }> = {
  knight: { emoji: "⚔️", color: "var(--muted-foreground)" },
  archer: { emoji: "🏹", color: "var(--muted-foreground)" },
  mage: { emoji: "🧙", color: "var(--muted-foreground)" },
  king: { emoji: "👑", color: "var(--muted-foreground)" },
  queen: { emoji: "👑", color: "var(--muted-foreground)" },
  shield: { emoji: "LM", color: "var(--primary)" },
  dragon: { emoji: "🐉", color: "var(--muted-foreground)" },
  orc: { emoji: "👹", color: "var(--muted-foreground)" },
  rogue: { emoji: "🗡️", color: "var(--muted-foreground)" },
  smith: { emoji: "⚒️", color: "var(--muted-foreground)" },
  golem: { emoji: "🪨", color: "var(--muted-foreground)" },
};

export const AVATAR_OPTIONS: { type: AvatarType; label: string; adminOnly?: boolean }[] = [
  { type: "king", label: "Rei", adminOnly: true },
  { type: "queen", label: "Rainha", adminOnly: true },
  { type: "knight", label: "Cavaleiro" },
  { type: "archer", label: "Arqueiro" },
  { type: "mage", label: "Mago" },
  { type: "dragon", label: "Dragao" },
  { type: "orc", label: "Orc" },
  { type: "rogue", label: "Ladino" },
  { type: "smith", label: "Ferreiro" },
  { type: "golem", label: "Golem" },
  { type: "shield", label: "Escudo LM" },
];

export default function MedievalAvatar({ type, size = 40, className, glow = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const src = AVATAR_IMAGES[type] ?? AVATAR_IMAGES.shield;

  return (
    <div
      className={`relative rounded-xl overflow-hidden flex items-center justify-center transition-all ${className ?? ""}`}
      style={{ width: size, height: size, background: "var(--card)" }}
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
        // Fallback: sober emoji on dark bg
        <div className="w-full h-full flex items-center justify-center bg-card">
          <span style={{ fontSize: size * 0.4 }}>
            {AVATAR_FALLBACK[type]?.emoji ?? "LM"}
          </span>
        </div>
      )}

      {/* Subtle border */}
      <div className="absolute inset-0 rounded-xl border border-border pointer-events-none" />
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
