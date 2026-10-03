import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { observeMasterSession, type MasterSessionScope, type MasterSessionState } from "@/lib/auth/master-session";

export function useMasterSession() {
  const [state, setState] = useState<MasterSessionState>({ ready: false, scope: null });
  const observer = useRef<ReturnType<typeof observeMasterSession> | null>(null);
  useEffect(() => {
    const current = observeMasterSession(supabase.auth, setState);
    observer.current = current;
    return () => { current.dispose(); observer.current = null; };
  }, []);
  const isCurrent = useCallback((scope: MasterSessionScope) => observer.current?.isCurrent(scope) ?? false, []);
  return { ...state, isCurrent };
}
