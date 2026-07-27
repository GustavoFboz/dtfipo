import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna se o usuário logado é admin.
 * Usa a função SQL security-definer `has_role(_user_id, _role)`.
 */
export function useIsAdmin() {
  return useQuery({
    queryKey: ["auth", "is-admin"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });
      if (error) return false;
      return Boolean(data);
    },
  });
}
