"use client";

export type AvatarType = "knight" | "archer" | "mage" | "king" | "queen" | "shield";

interface AvatarProps {
  type: AvatarType;
  size?: number;
  className?: string;
}

const ACCENT = "#0d4af5";
const ACCENT_LIGHT = "#3b6ff5";

// ⚔️ Knight — helmet with visor
function Knight({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke={ACCENT} strokeWidth="0.5" />
      <path d="M12 16c0-5 3.5-9 8-9s8 4 8 9v4c0 2-1 3-2 3.5l-1 4.5H15l-1-4.5c-1-.5-2-1.5-2-3.5v-4z" fill="#1a1a2e" stroke={ACCENT_LIGHT} strokeWidth="0.8" />
      <rect x="12" y="17" width="16" height="2" rx="0.5" fill={ACCENT} opacity="0.6" />
      <path d="M16 19v3M20 19v4M24 19v3" stroke={ACCENT_LIGHT} strokeWidth="0.6" opacity="0.4" />
      <rect x="14" y="28" width="12" height="3" rx="1.5" fill="#1a1a2e" stroke={ACCENT} strokeWidth="0.5" />
    </svg>
  );
}

// 🏹 Archer — hooded figure with bow
function Archer({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke={ACCENT} strokeWidth="0.5" />
      <path d="M14 12c2-3 5-5 8-4 3 1 5 3 5 6v5c0 2-1 4-3 5l-2 5H18l-2-5c-2-1-3-3-3-5v-5c0-1 0-1 1-2z" fill="#1a1a2e" stroke={ACCENT_LIGHT} strokeWidth="0.8" />
      <path d="M13 10c3-4 7-5 10-3" stroke={ACCENT_LIGHT} strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="17" r="1" fill={ACCENT} opacity="0.7" />
      <circle cx="24" cy="17" r="1" fill={ACCENT} opacity="0.7" />
      <path d="M30 10c0 8-2 16-2 20" stroke={ACCENT} strokeWidth="0.8" opacity="0.5" />
      <path d="M28 14l4-2M28 18l4-1M28 22l3 0" stroke={ACCENT_LIGHT} strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}

// 🧙 Mage — robed figure with staff
function Mage({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke={ACCENT} strokeWidth="0.5" />
      <path d="M15 10l5-3 5 3v6c0 3-2 5-5 6-3-1-5-3-5-6v-6z" fill="#1a1a2e" stroke={ACCENT_LIGHT} strokeWidth="0.8" />
      <circle cx="20" cy="14" r="3" fill="none" stroke={ACCENT} strokeWidth="0.8" />
      <circle cx="20" cy="14" r="1" fill={ACCENT} opacity="0.8" />
      <path d="M16 22l-2 10h12l-2-10" fill="#1a1a2e" stroke={ACCENT_LIGHT} strokeWidth="0.6" />
      <line x1="9" y1="8" x2="9" y2="32" stroke={ACCENT} strokeWidth="1" opacity="0.4" />
      <circle cx="9" cy="7" r="2" fill={ACCENT} opacity="0.3" />
      <path d="M7 7l2-3 2 3" fill={ACCENT} opacity="0.5" />
    </svg>
  );
}

// 👑 King — crown with regal bearing (Admin exclusive)
function King({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke="#f59e0b" strokeWidth="0.8" />
      <path d="M12 9l3 4 5-4 5 4 3-4v6H12V9z" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" strokeWidth="0.6" />
      <circle cx="15" cy="9" r="1" fill="#f59e0b" opacity="0.6" />
      <circle cx="20" cy="6" r="1.2" fill="#f59e0b" opacity="0.8" />
      <circle cx="25" cy="9" r="1" fill="#f59e0b" opacity="0.6" />
      <path d="M14 16c0-3 2.5-5 6-5s6 2 6 5v3c0 2-1 3-2 4l-1 5H17l-1-5c-1-1-2-2-2-4v-3z" fill="#1a1a2e" stroke="#f59e0b" strokeWidth="0.6" />
      <circle cx="18" cy="18" r="1" fill="#f59e0b" opacity="0.5" />
      <circle cx="22" cy="18" r="1" fill="#f59e0b" opacity="0.5" />
      <rect x="15" y="29" width="10" height="2.5" rx="1" fill="#1a1a2e" stroke="#f59e0b" strokeWidth="0.5" />
    </svg>
  );
}

// 👑 Queen — tiara with elegant silhouette (Admin exclusive)
function Queen({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke="#f59e0b" strokeWidth="0.8" />
      <path d="M14 10c2-2 4-3 6-3s4 1 6 3" stroke="#f59e0b" strokeWidth="0.8" fill="none" />
      <circle cx="17" cy="8" r="0.8" fill="#f59e0b" opacity="0.7" />
      <circle cx="20" cy="7" r="1" fill="#f59e0b" opacity="0.9" />
      <circle cx="23" cy="8" r="0.8" fill="#f59e0b" opacity="0.7" />
      <path d="M14 14c0-3 2.5-4 6-4s6 1 6 4v4c0 2-1 4-3 5-1 0.5-2 1-3 1s-2-.5-3-1c-2-1-3-3-3-5v-4z" fill="#1a1a2e" stroke="#f59e0b" strokeWidth="0.6" />
      <path d="M15 24c1 2 2 3 5 4 3-1 4-2 5-4l1 6H14l1-6z" fill="#1a1a2e" stroke="#f59e0b" strokeWidth="0.5" />
      <circle cx="18" cy="17" r="0.8" fill="#f59e0b" opacity="0.5" />
      <circle cx="22" cy="17" r="0.8" fill="#f59e0b" opacity="0.5" />
    </svg>
  );
}

// 🛡️ Shield — default/fallback
function Shield({ size = 40 }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="19" fill="#111118" stroke={ACCENT} strokeWidth="0.5" />
      <path d="M12 12l8-4 8 4v8c0 5-3 9-8 11-5-2-8-6-8-11v-8z" fill="#1a1a2e" stroke={ACCENT_LIGHT} strokeWidth="0.8" />
      <path d="M20 12v16" stroke={ACCENT} strokeWidth="0.5" opacity="0.3" />
      <path d="M14 15l6-2 6 2" stroke={ACCENT} strokeWidth="0.5" opacity="0.3" />
      <circle cx="20" cy="20" r="3" fill="none" stroke={ACCENT} strokeWidth="0.8" opacity="0.5" />
      <text x="20" y="22" textAnchor="middle" fontSize="5" fill={ACCENT} fontWeight="bold" opacity="0.7">LM</text>
    </svg>
  );
}

const AVATAR_MAP: Record<AvatarType, (props: { size: number }) => JSX.Element> = {
  knight: Knight,
  archer: Archer,
  mage: Mage,
  king: King,
  queen: Queen,
  shield: Shield,
};

export const AVATAR_OPTIONS: { type: AvatarType; label: string; adminOnly?: boolean }[] = [
  { type: "king", label: "Rei", adminOnly: true },
  { type: "queen", label: "Rainha", adminOnly: true },
  { type: "knight", label: "Cavaleiro" },
  { type: "archer", label: "Arqueiro" },
  { type: "mage", label: "Mago" },
  { type: "shield", label: "Escudo" },
];

export default function MedievalAvatar({ type, size = 40, className }: AvatarProps) {
  const Component = AVATAR_MAP[type] ?? Shield;
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Component size={size} />
    </div>
  );
}

// Get avatar for a user (stored in localStorage per userId)
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
