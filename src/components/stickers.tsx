// Pack curado de figurinhas SVG minimalistas (design flat, traço fino, paleta neutra)
import type { ReactNode } from "react";

type StickerDef = { id: string; label: string; node: ReactNode };

const C_PRIMARY = "#3b82f6";
const C_AMBER = "#f59e0b";
const C_ROSE = "#f43f5e";
const C_GREEN = "#10b981";
const C_SLATE = "#475569";
const C_INK = "#0f172a";

const STICKERS: StickerDef[] = [
  { id: "thumbs_up", label: "Joinha", node: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="28" width="12" height="26" rx="3" fill={C_SLATE} opacity="0.15" stroke={C_INK} strokeWidth="1.5"/>
      <path d="M22 28l8-14c2-4 8-2 7 2l-2 8h13c3 0 5 2 4 5l-3 16c-1 4-4 7-8 7H22V28z" fill={C_PRIMARY} opacity="0.9" stroke={C_INK} strokeWidth="1.5"/>
    </svg>
  )},
  { id: "heart", label: "Coração", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 54s-20-12-20-26a10 10 0 0120-3 10 10 0 0120 3c0 14-20 26-20 26z" fill={C_ROSE} stroke={C_INK} strokeWidth="1.5"/>
    </svg>
  )},
  { id: "check", label: "Tudo certo", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="24" fill={C_GREEN} opacity="0.9" stroke={C_INK} strokeWidth="1.5"/>
      <path d="M20 33l9 9 16-18" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )},
  { id: "fire", label: "Fogo", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 6c4 8 14 14 14 26a14 14 0 11-28 0c0-6 4-8 4-14 6 2 4 8 10 8-2-8 2-12 0-20z" fill={C_AMBER} stroke={C_INK} strokeWidth="1.5"/>
      <path d="M32 50a6 6 0 006-6c0-4-3-6-6-10-3 4-6 6-6 10a6 6 0 006 6z" fill={C_ROSE}/>
    </svg>
  )},
  { id: "star", label: "Estrela", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 6l8 18 20 2-15 13 5 19-18-11-18 11 5-19L4 26l20-2z" fill={C_AMBER} stroke={C_INK} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )},
  { id: "clap", label: "Palmas", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M14 36c-3-3-3-8 0-11l10-10c3-3 8-3 11 0l14 14c3 3 3 8 0 11l-10 10c-3 3-8 3-11 0L14 36z" fill={C_AMBER} opacity="0.9" stroke={C_INK} strokeWidth="1.5"/>
      <path d="M22 24l8 8M28 18l8 8M34 12l8 8" stroke={C_INK} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
  { id: "tooth", label: "Dente", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M20 10c-6 0-10 4-10 10 0 6 2 10 4 18s4 16 8 16 4-12 10-12 6 12 10 12 6-8 8-16 4-12 4-18-4-10-10-10c-4 0-6 2-12 2s-8-2-12-2z" fill="#fff" stroke={C_INK} strokeWidth="1.5"/>
    </svg>
  )},
  { id: "eyes", label: "Olhinhos", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <ellipse cx="22" cy="32" rx="10" ry="12" fill="#fff" stroke={C_INK} strokeWidth="1.5"/>
      <ellipse cx="42" cy="32" rx="10" ry="12" fill="#fff" stroke={C_INK} strokeWidth="1.5"/>
      <circle cx="24" cy="34" r="4" fill={C_INK}/>
      <circle cx="44" cy="34" r="4" fill={C_INK}/>
    </svg>
  )},
  { id: "rocket", label: "Foguete", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 6c10 8 14 18 14 28v6H18v-6c0-10 4-20 14-28z" fill="#fff" stroke={C_INK} strokeWidth="1.5"/>
      <circle cx="32" cy="28" r="5" fill={C_PRIMARY} stroke={C_INK} strokeWidth="1.5"/>
      <path d="M18 36l-6 8 10-2M46 36l6 8-10-2" fill={C_ROSE} stroke={C_INK} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M28 48l-3 8M36 48l3 8M32 50v8" stroke={C_AMBER} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )},
  { id: "warn", label: "Atenção", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 6l28 50H4L32 6z" fill={C_AMBER} stroke={C_INK} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M32 24v14" stroke={C_INK} strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="32" cy="46" r="2.5" fill={C_INK}/>
    </svg>
  )},
  { id: "party", label: "Comemorar", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M10 54L24 14l24 24-38 16z" fill={C_ROSE} opacity="0.85" stroke={C_INK} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="44" cy="14" r="2" fill={C_PRIMARY}/>
      <circle cx="54" cy="20" r="2" fill={C_AMBER}/>
      <circle cx="50" cy="8" r="2" fill={C_GREEN}/>
    </svg>
  )},
  { id: "thinking", label: "Pensando", node: (
    <svg viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="22" fill={C_AMBER} opacity="0.85" stroke={C_INK} strokeWidth="1.5"/>
      <circle cx="24" cy="28" r="2" fill={C_INK}/>
      <circle cx="40" cy="28" r="2" fill={C_INK}/>
      <path d="M22 42c4-3 12-3 18 0" stroke={C_INK} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )},
];

export const STICKER_INDEX: Record<string, StickerDef> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s])
);

export const STICKER_LIST = STICKERS;

export function Sticker({ id, size = 48 }: { id: string; size?: number }) {
  const s = STICKER_INDEX[id];
  if (!s) return null;
  return (
    <span style={{ width: size, height: size, display: "inline-block" }} aria-label={s.label}>
      {s.node}
    </span>
  );
}
