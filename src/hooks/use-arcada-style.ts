import { useCallback, useEffect, useState } from "react";

export type ArcadaStyle = "padrao" | "azul";
const STORAGE_KEY = "df-arcada-style";

export function getStoredArcadaStyle(): ArcadaStyle {
  if (typeof window === "undefined") return "padrao";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "azul" ? "azul" : "padrao";
}

export function applyArcadaStyle(style: ArcadaStyle) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (style === "padrao") root.removeAttribute("data-arcada");
  else root.setAttribute("data-arcada", style);
}

export function useArcadaStyle() {
  const [style, setStyleState] = useState<ArcadaStyle>(() => getStoredArcadaStyle());

  useEffect(() => {
    applyArcadaStyle(style);
    try {
      window.localStorage.setItem(STORAGE_KEY, style);
    } catch {}
  }, [style]);

  const setStyle = useCallback((s: ArcadaStyle) => setStyleState(s), []);
  return { style, setStyle };
}
