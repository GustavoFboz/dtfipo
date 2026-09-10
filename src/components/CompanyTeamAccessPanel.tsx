import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Building2, FlaskConical, Stethoscope, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const SESSION_META = {
  laboratory: { label: "Laboratório", icon: FlaskConical },
  clinic: { label: "Clínica", icon: Stethoscope },
  radiology: { label: "Radiologia", icon: ScanLine },
} as const;

type SessionType = keyof typeof SESSION_META;
type TeamAccess = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  member_role: string | null;
  profession_type: string | null;
  status: string;
  is_founder: boolean;
  is_admin: boolean;
  sessions: string[] | null;
};

function missingRpc(error: any) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || msg.includes("schema cache") || msg.includes("could not find");
}

export function CompanyTeamAccessPanel() {
  const qc = useQueryClient();
  const accessQ = useQuery({
    queryKey: ["company_team_access", "v035"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_team_access_v035" as never);
      if (error) {
        if (missingRpc(error) || String(error.message ?? "").toLowerCase().includes("sem permissão")) return [] as TeamAccess[];
        throw error;
      }
      return (data ?? []) as unknown as TeamAccess[];
    },
    staleTime: 10_000,
    retry: 1,
  });

  const rows = accessQ.data ?? [];
  const availableSessions = useMemo(() => {
    const set = new Set<SessionType>();
    for (const row of rows) for (const s of row.sessions ?? []) if (s in SESSION_META) set.add(s as SessionType);
    // Founder always exposes the complete contracted session set returned by the RPC.
    return Array.from(set);
  }, [rows]);

  const setSessions = useMutation({
    mutationFn: async ({ userId, sessions }: { userId: string; sessions: string[] }) => {
      const { error } = await supabase.rpc("company_set_member_sessions_v035" as never, {
        _member_user_id: userId,
        _sessions: sessions,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acessos atualizados");
      void qc.invalidateQueries({ queryKey: ["company_team_access"] });
      void qc.invalidateQueries({ queryKey: ["company_member_sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setAdmin = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase.rpc("company_set_member_admin_v035" as never, {
        _member_user_id: userId,
        _is_admin: value,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão administrativa atualizada");
      void qc.invalidateQueries({ queryKey: ["company_team_access"] });
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQ.isLoading || rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Acessos da empresa</div>
          <p className="text-xs text-muted-foreground">Defina quais ambientes cada membro pode usar e quem pode administrar a conta.</p>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {rows.map((member) => {
          const selected = new Set((member.sessions ?? []).filter(Boolean));
          return (
            <div key={member.user_id} className="px-4 py-3.5 flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-5">
              <div className="min-w-0 xl:w-[260px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{member.full_name || member.email || "Membro"}</span>
                  {member.is_founder && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <ShieldCheck className="h-3 w-3" /> Fundador
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {member.profession_type || member.member_role || "Profissional"}{member.email ? ` · ${member.email}` : ""}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                {availableSessions.map((session) => {
                  const meta = SESSION_META[session];
                  const Icon = meta.icon;
                  const active = member.is_founder || selected.has(session);
                  return (
                    <Button
                      key={session}
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "ghost"}
                      disabled={member.is_founder || setSessions.isPending}
                      className="h-8 rounded-full px-3 text-xs gap-1.5"
                      onClick={() => {
                        const next = new Set(selected);
                        active ? next.delete(session) : next.add(session);
                        setSessions.mutate({ userId: member.user_id, sessions: Array.from(next) });
                      }}
                      title={member.is_founder ? "O fundador possui acesso a todos os ambientes contratados." : undefined}
                    >
                      <Icon className="h-3.5 w-3.5" /> {meta.label}
                    </Button>
                  );
                })}
              </div>

              <label className="shrink-0 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span>Administrador</span>
                <Switch
                  checked={member.is_admin}
                  disabled={member.is_founder || setAdmin.isPending}
                  onCheckedChange={(value) => setAdmin.mutate({ userId: member.user_id, value })}
                  aria-label={`Administrador: ${member.full_name || member.email || "membro"}`}
                />
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
