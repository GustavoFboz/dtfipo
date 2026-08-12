// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirm, promptDialog } from "@/lib/confirm";
import { Trash2, Users2, Search, ShieldCheck, AtSign, PhoneCall, Pencil, Clock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditTeamMemberDialog } from "./EditTeamMemberDialog";
import { fetchProfile, fetchPendingJoinRequests, approveJoinRequest, rejectJoinRequest, adminSetMemberPassword } from "@/lib/api";
import { listTeamMembers } from "@/lib/team.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export function EquipeManagement() {
  const qc = useQueryClient();
  const listTeamMembersFn = useServerFn(listTeamMembers);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: currentProfile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isAdmin = currentProfile?.role === "CEO" || currentProfile?.role === "DR";
  const isCEO = currentProfile?.role === "CEO";

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles_full", currentProfile?.clinic_id],
    enabled: !!currentProfile,
    queryFn: async () => {
      const result = await listTeamMembersFn();
      const response = result as { success?: boolean; error?: string; members?: any[] };
      if (response?.success === false) throw new Error(response.error ?? "Falha ao carregar equipe");
      return response.members ?? [];
    },
  });



  const deleteMember = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.rpc("delete_team_member", {
        p_user_id: user_id,
        p_reason: "Exclusão manual via painel de equipe"
      });
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string };
      if (result && !result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success("Membro removido com sucesso");
      qc.invalidateQueries({ queryKey: ["profiles_full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const matchesSearch = !q || 
        [p.full_name, p.email, p.phone].some(v => v?.toLowerCase().includes(q.toLowerCase()));
      const matchesRole = roleFilter === "all" || p.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [profiles, q, roleFilter]);

  if (isLoading) return (
    <div className="space-y-8">
      {isAdmin && <JoinRequestsPanel />}
      <div className="p-12 text-center animate-pulse text-slate-400 font-bold uppercase tracking-[0.08em]">Carregando equipe...</div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 font-light">
      {isAdmin && <JoinRequestsPanel />}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/60 dark:bg-slate-950/70 backdrop-blur-md p-4 rounded-[2rem] border border-slate-100/50 dark:border-white/10 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Tabs value={roleFilter} onValueChange={setRoleFilter} className="w-auto">
            <TabsList className="bg-slate-100/50 dark:bg-white/5 p-1 rounded-2xl border-0 h-11">
              <TabsTrigger value="all" className="px-5">Todos</TabsTrigger>
              <TabsTrigger value="CEO" className="px-5">CEO</TabsTrigger>
              <TabsTrigger value="DR" className="px-5">Dentistas</TabsTrigger>
              <TabsTrigger value="PROTETICO" className="px-5">Protéticos</TabsTrigger>
              <TabsTrigger value="CADISTA" className="px-5">Cadistas</TabsTrigger>
              <TabsTrigger value="ATENDIMENTO" className="px-5">Atendimento</TabsTrigger>
              <TabsTrigger value="SOLICITANTE" className="px-5">Solicitantes</TabsTrigger>
              <TabsTrigger value="USER" className="px-5">Pendentes</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 stroke-[1.5px]" />
          <Input 
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar equipe..." 
            className="pl-11 h-11 rounded-2xl border-slate-100 dark:border-white/10 bg-white/80 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light text-sm shadow-none focus-visible:ring-primary/10" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => (
          <div 
            key={p.id} 
            className="group bg-white dark:bg-slate-950 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/10 shadow-[0_4px_30px_rgb(0,0,0,0.015)] transition-all duration-700 hover:shadow-[0_25px_60px_rgba(0,0,0,0.04)] hover:-translate-y-2"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white dark:bg-white/[0.06] shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center text-xl font-light text-primary dark:text-foreground group-hover:border-primary/20 transition-all duration-500">
                  {p.full_name?.[0]?.toUpperCase() ?? <Users2 className="h-6 w-6 stroke-[1.2px]" />}
                </div>
                <div>
                  <h3 className="font-light text-slate-900 dark:text-slate-100 leading-tight text-lg tracking-tight">{p.full_name || "Sem nome"}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-lg border-primary/10 text-primary/80`}>
                      {p.role === "DR" ? "Dentista" : p.role === "PROTETICO" ? "Protético" : p.role === "ATENDIMENTO" ? "Atendimento" : p.role === "CADISTA" ? "Cadista" : p.role === "SOLICITANTE" ? "Solicitante" : p.role}
                    </Badge>
                    {p.user_code && (
                      <span className="text-[9px] font-mono text-slate-400 tracking-wider">{p.user_code}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-50 dark:border-white/10 opacity-40 group-hover:opacity-100 transition-opacity">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors stroke-[1.5px]" />
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <div className="h-8 w-8 rounded-xl bg-slate-50/80 dark:bg-white/5 flex items-center justify-center shrink-0 border border-slate-100/50 dark:border-white/10">
                  <AtSign className="h-3.5 w-3.5 text-primary/60 stroke-[1.5px]" />
                </div>
                <span className="truncate font-light tracking-tight">{p.email}</span>
              </div>
              {p.phone && (
                <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                  <div className="h-8 w-8 rounded-xl bg-slate-50/80 dark:bg-white/5 flex items-center justify-center shrink-0 border border-slate-100/50 dark:border-white/10">
                    <PhoneCall className="h-3.5 w-3.5 text-primary/60 stroke-[1.5px]" />
                  </div>
                  <span className="font-light tracking-tight">{p.phone}</span>
                </div>
              )}
            </div>


            {isCEO && (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary hover:bg-primary/5 rounded-xl"
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl"
                  onClick={async () => {
                    const pw = await promptDialog({
                      title: "Redefinir senha",
                      description: "Informe a nova senha com no mínimo 8 caracteres.",
                      placeholder: "Nova senha",
                      confirmText: "Redefinir",
                      required: true,
                    });
                    if (!pw) return;
                    try {
                      await adminSetMemberPassword(p.id, pw);
                      toast.success("Senha redefinida");
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Redefinir senha
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                  onClick={async () => {
                    if (await confirm({ title: "Excluir membro", description: "Tem certeza que deseja excluir este membro? Esta ação é irreversível.", confirmText: "Excluir", destructive: true })) {
                      deleteMember.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Conta
                </Button>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-24 text-center">
            <div className="h-20 w-20 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/10 grid place-items-center mx-auto mb-6">
              <Users2 className="h-10 w-10 text-slate-200" />
            </div>
            <h3 className="text-slate-900 dark:text-slate-100 font-bold">Nenhum colaborador encontrado</h3>
            <p className="text-slate-500 text-sm mt-1">Tente ajustar sua busca ou filtros.</p>
          </div>
        )}
      </div>

      <EditTeamMemberDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        profile={editing}
      />
    </div>
  );
}

const ROLE_OPTIONS = ["CEO", "DR", "PROTETICO", "CADISTA", "ATENDIMENTO", "SOLICITANTE", "USER"] as const;

function JoinRequestsPanel() {
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery({
    queryKey: ["join_requests"],
    queryFn: fetchPendingJoinRequests,
    refetchInterval: 10000,
  });

  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});

  const approve = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => approveJoinRequest(id, role),
    onSuccess: () => {
      toast.success("Solicitação aprovada");
      qc.invalidateQueries({ queryKey: ["join_requests"] });
      qc.invalidateQueries({ queryKey: ["profiles_full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectJoinRequest(id),
    onSuccess: () => {
      toast.success("Solicitação recusada");
      qc.invalidateQueries({ queryKey: ["join_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (requests.length === 0) return null;

  return (
    <div className="bg-amber-50/60 border border-amber-200/60 rounded-3xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-amber-600" />
        <h3 className="font-medium text-amber-900">Solicitações de acesso pendentes ({requests.length})</h3>
      </div>
      <div className="space-y-3">
        {requests.map((r) => {
          const profile: any = (r as any).profile;
          const role = selectedRoles[r.id] || "USER";
          return (
            <div key={r.id} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between border border-amber-100">
              <div>
                <div className="font-medium text-slate-900">{profile?.full_name || profile?.email || "Usuário"}</div>
                <div className="text-xs text-slate-500">{profile?.email} · {profile?.user_code}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={role} onValueChange={(v) => setSelectedRoles((s) => ({ ...s, [r.id]: v }))}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt === "DR" ? "Dentista" : opt === "PROTETICO" ? "Protético" : opt === "ATENDIMENTO" ? "Atendimento" : opt === "CADISTA" ? "Cadista" : opt === "SOLICITANTE" ? "Solicitante" : opt === "USER" ? "Usuário" : opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => approve.mutate({ id: r.id, role })} disabled={approve.isPending}>
                  Aceitar
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
                  Recusar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
