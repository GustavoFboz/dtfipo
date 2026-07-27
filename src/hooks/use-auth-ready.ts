import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate para queries que dependem de `auth.uid()`.
 *
 * Uso:
 *   const { isReady, userId } = useAuthReady();
 *   useQuery({ queryKey: [...], queryFn, enabled: isReady && !!userId });
 *
 * Evita disparo com uid transitoriamente nulo entre logout/login,
 * o que causaria 401 storm ou queries retornando vazias por engano.
 */
export function useAuthReady() {
  const [state, setState] = useState<{
    isReady: boolean;
    userId: string | null;
  }>({ isReady: false, userId: null });

  useEffect(() => {
    let disposed = false;
    supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      setState({ isReady: true, userId: data.session?.user?.id ?? null });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ isReady: true, userId: session?.user?.id ?? null });
    });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
