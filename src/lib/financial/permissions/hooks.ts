// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canAccessModule,
  canPerform,
  financialScope,
  modulesForRole,
  type FinancialAction,
  type FinancialModule,
  type FinancialRole,
  type FinancialScope,
  type TenantKind,
} from "./config";

/**
 * Mapeia o role armazenado em `profiles.role` para um FinancialRole.
 * Roles legadas (USER, ATENDIMENTO, DR) são normalizadas.
 */
function normalizeRole(raw: string | null | undefined): FinancialRole | null {
  if (!raw) return null;
  const r = raw.toUpperCase();
  const map: Record<string, FinancialRole> = {
    CEO: "CEO",
    ADMIN: "ADMIN",
    DR: "ADMIN",
    FINANCEIRO: "FINANCEIRO",
    GESTOR: "GESTOR",
    DENTISTA: "DENTISTA",
    CADISTA: "CADISTA",
    PROTETICO: "PROTETICO",
    "PROTÉTICO": "PROTETICO",
    COLABORADOR: "COLABORADOR",
    USER: "COLABORADOR",
    ATENDIMENTO: "COLABORADOR",
  };
  return map[r] ?? null;
}

export interface FinancialPermissionsCtx {
  role: FinancialRole | null;
  tenantKind: TenantKind;
  clinicId: string | null;
  userId: string | null;
  scope: FinancialScope;
  ownOnly: boolean;
  canAccess: (m: FinancialModule) => boolean;
  can: (m: FinancialModule, a: FinancialAction) => boolean;
  modules: FinancialModule[];
  loading: boolean;
}

/**
 * Hook central de permissões financeiras.
 * Lê `profiles` do usuário logado + tipo de empresa (`clinics.kind`).
 * Retorna helpers pra guardar rotas, esconder botões, etc.
 */
export function useFinancialPermissions(): FinancialPermissionsCtx {
  const q = useQuery({
    queryKey: ["financial", "permissions", "me"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const email = userData.user?.email?.toLowerCase() ?? null;
      if (!uid) return { role: null, tenantKind: "ipo" as TenantKind, clinicId: null };

      // Beta testers ganham acesso completo (ADMIN) a todos os módulos financeiros.
      let isBeta = false;
      if (email) {
        const { data: beta } = await supabase
          .from("beta_testers")
          .select("id")
          .eq("active", true)
          .ilike("email", email)
          .maybeSingle();
        isBeta = Boolean(beta);
      }

      const { data: profile } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("role, clinic_id" as any)
        .eq("id", uid)
        .maybeSingle();

      const rawRole = (profile as { role?: string } | null)?.role;
      const role: FinancialRole | null = isBeta ? "ADMIN" : normalizeRole(rawRole);
      const clinicId = (profile as { clinic_id?: string } | null)?.clinic_id ?? null;

      let tenantKind: TenantKind = "ipo";
      if (clinicId) {
        const { data: clinic } = await supabase
          .from("clinics")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("kind" as any)
          .eq("id", clinicId)
          .maybeSingle();
        const k = (clinic as { kind?: string } | null)?.kind;
        if (k === "laboratorio") tenantKind = "laboratorio";
        else if (k === "clinica") tenantKind = "clinica";
        else tenantKind = "ipo";
      }

      return { role, tenantKind, clinicId, userId: uid };
    },
  });

  const role = q.data?.role ?? null;
  const tenantKind = q.data?.tenantKind ?? "ipo";
  const clinicId = q.data?.clinicId ?? null;
  const userId = q.data?.userId ?? null;
  const scope = financialScope(role);

  return {
    role,
    tenantKind,
    clinicId,
    userId,
    scope,
    ownOnly: scope === "own",
    loading: q.isLoading,
    canAccess: (m) => canAccessModule(role, m, tenantKind),
    can: (m, a) => canPerform(role, m, a, tenantKind),
    modules: modulesForRole(role, tenantKind),
  };
}
