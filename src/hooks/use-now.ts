import { useEffect, useState } from "react";

/**
 * Retorna a data/hora atual atualizada a cada segundo.
 * Retorna `null` no SSR e na primeira renderização do cliente para
 * evitar hydration mismatch — assim que monta, começa a tickar.
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
