// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Verifica se o usuário logado faz parte do programa de testadores beta.
 * Testadores beta recebem acesso antecipado a todos os módulos.
 */
export function useIsBetaTester() {
  return useQuery({
    queryKey: ["auth", "is-beta-tester"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email?.toLowerCase();
      if (!email) return false;
      const { data, error } = await supabase
        .from("beta_testers")
        .select("id")
        .eq("active", true)
        .ilike("email", email)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });
}
