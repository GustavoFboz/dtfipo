import { useEffect, useState } from "react";

/**
 * Persiste um snapshot serializável de estado no sessionStorage e o
 * restaura na próxima montagem. Usado para reabrir dialogs com o mesmo
 * conteúdo depois de um F5.
 *
 * - Hidratação acontece apenas uma vez enquanto `enabled` for true.
 * - Gravação é debounced (300ms) para não escrever a cada tecla.
 * - Falhas de storage são silenciadas (modo privado / cotas cheias).
 */
export function useSessionSnapshot<T extends Record<string, unknown>>(
  key: string | null,
  enabled: boolean,
  snapshot: T,
  apply: (data: Partial<T>) => void,
) {
  const [hydrated, setHydrated] = useState(false);

  // Hidrata assim que o dialog abre.
  useEffect(() => {
    if (!enabled || !key || hydrated || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") apply(data as Partial<T>);
      }
    } catch {
      // ignora storage indisponível/corrompido
    }
    setHydrated(true);
    // apply é referência instável mas só usamos na primeira execução;
    // dependências mínimas garantem que só rode uma vez por (key, enabled).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, hydrated]);

  // Reseta o flag quando o dialog fecha, permitindo re-hidratar depois.
  useEffect(() => {
    if (!enabled) setHydrated(false);
  }, [enabled]);

  // Persiste snapshot (debounced) após hidratar.
  useEffect(() => {
    if (!enabled || !key || !hydrated || typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // ignora
      }
    }, 300);
    return () => clearTimeout(t);
  }, [enabled, key, hydrated, snapshot]);
}

export function clearSessionSnapshot(...keys: (string | null | undefined)[]) {
  if (typeof window === "undefined") return;
  for (const k of keys) {
    if (!k) continue;
    try {
      sessionStorage.removeItem(k);
    } catch {
      // ignora
    }
  }
}
