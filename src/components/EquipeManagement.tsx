// @ts-nocheck
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Clock, KeyRound, Pencil, PhoneCall, Search, ShieldCheck, Trash2, Users2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { confirm, promptDialog } from "@/lib/confirm";
import { fetchProfile, fetchPendingJoinRequests, approveJoinRequest, rejectJoinRequest, adminSetMemberPassword } from "@/lib/api";
import { listTeamMembers } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditTeamMemberDialog } from "./EditTeamMemberDialog";

const ALL_ROLES = ["CEO", "DR", "PROTETICO", "CADISTA", "ATENDIMENTO", "SOLICITANTE", "USER"];
const CLINIC_ROLES = ["CEO", "DR", "ATENDIMENTO", "USER"];
const ROLE_LABEL: Record<string, string> = {
  CEO: "Administrador",
  DR: "Dentista",
  PROTETICO: "Protético",
  CADISTA: "Cadista",
  ATENDIMENTO: "Atendimento",
  SOLICITANTE: "Solicitante",
  USER: "Usuário",
};

export function EquipeManagement({ mode = "laboratory" }: { mode?: "laboratory" | "clinic" }) {
  const clinicMode = mode === "clinic";
  const accent = clinicMode ? "#1e8f87" : undefined;
  const qc = useQueryClient();
  const listTeamMembersFn = useServerFn(listTeamMembers);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: currentProfile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isAdmin = currentProfile?.role === "CEO" || currentProfile?.role === "DR";
  const isCEO = currentProfile?.role === "CEO";
  const roleOptions = clinicMode ? CLINIC_ROLES : ALL_ROLES;

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
      const { data, error } = await supabase.rpc("delete_team_member", { p_user_id: user_id, p_reason: "Exclusão manual via painel de equipe" });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (result && !result.success) throw new Error(result.error);
    },
    onSuccess: () => { toast.success("Membro removido com sucesso"); qc.invalidateQueries({ queryKey: ["profiles_full"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => profiles.filter((p: any) => {
    if (clinicMode && !CLINIC_ROLES.includes(String(p.role))) return false;
    const matchesSearch = !q || [p.full_name, p.email, p.phone].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
    const matchesRole = roleFilter === "all" || p.role === roleFilter;
    return matchesSearch && matchesRole;
  }), [profiles, q, roleFilter, clinicMode]);

  if (isLoading) return <div className="p-12 text-center text-sm font-light text-slate-400">Carregando equipe…</div>;

  return (
    <div className="space-y-5">
      {isAdmin && <JoinRequestsPanel mode={mode} />}

      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/70 bg-white p-3 md:flex-row md:items-center md:justify-between dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-wrap gap-1.5">
          <FilterButton active={roleFilter === "all"} onClick={() => setRoleFilter("all")} label="Todos" clinicMode={clinicMode} />
          {roleOptions.map((role) => <FilterButton key={role} active={roleFilter === role} onClick={() => setRoleFilter(role)} label={ROLE_LABEL[role]} clinicMode={clinicMode} />)}
        </div>
        <div className="relative w-full md:w-72"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membro da equipe" className={`h-10 rounded-xl border-slate-100 bg-slate-50/60 pl-10 shadow-none dark:border-white/10 dark:bg-white/[0.03] ${clinicMode ? "focus-visible:ring-[#1e8f87]/15" : "focus-visible:ring-primary/10"}`} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p: any) => (
          <article key={p.id} className={`rounded-[26px] border border-slate-200/70 bg-white p-5 transition hover:-translate-y-px hover:shadow-sm dark:border-white/10 dark:bg-slate-950 ${clinicMode ? "hover:border-[#1e8f87]/20" : "hover:border-primary/20"}`}>
            <div className="flex items-start gap-4">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-light ${clinicMode ? "bg-[#1e8f87]/8 text-[#1e8f87]" : "bg-primary/8 text-primary"}`}>{p.full_name?.[0]?.toUpperCase() ?? <Users2 className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1"><h3 className="truncate text-base font-medium text-slate-900 dark:text-white">{p.full_name || "Sem nome"}</h3><div className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] ${clinicMode ? "bg-[#1e8f87]/8 text-[#1e8f87]" : "bg-primary/8 text-primary"}`}>{ROLE_LABEL[p.role] ?? p.role}</div></div>
              <ShieldCheck className={`h-4 w-4 ${clinicMode ? "text-[#1e8f87]/55" : "text-primary/55"}`} />
            </div>

            <div className="mt-5 space-y-2.5">
              <Contact icon={AtSign} value={p.email || "E-mail não informado"} accent={accent} />
              <Contact icon={PhoneCall} value={p.phone || "Telefone não informado"} accent={accent} />
            </div>

            {isCEO && (
              <div className="mt-5 flex flex-wrap gap-1 border-t border-slate-100 pt-4 dark:border-white/5">
                <Button variant="ghost" size="sm" className={`rounded-xl text-xs ${clinicMode ? "text-[#1e8f87] hover:bg-[#1e8f87]/6 hover:text-[#1e8f87]" : "text-primary"}`} onClick={() => setEditing(p)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar</Button>
                <Button variant="ghost" size="sm" className="rounded-xl text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={async () => { const pw = await promptDialog({ title: "Redefinir senha", description: "Informe a nova senha com no mínimo 8 caracteres.", placeholder: "Nova senha", confirmText: "Redefinir", required: true }); if (!pw) return; try { await adminSetMemberPassword(p.id, pw); toast.success("Senha redefinida"); } catch (e: any) { toast.error(e.message); } }}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Senha</Button>
                <Button variant="ghost" size="sm" className="rounded-xl text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={async () => { if (await confirm({ title: "Excluir membro", description: "Tem certeza que deseja excluir este membro? Esta ação é irreversível.", confirmText: "Excluir", destructive: true })) deleteMember.mutate(p.id); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover</Button>
              </div>
            )}
          </article>
        ))}
      </div>

      {filtered.length === 0 && <div className="rounded-[28px] border border-dashed border-slate-200 py-16 text-center dark:border-white/10"><Users2 className="mx-auto h-8 w-8 text-slate-200" /><p className="mt-3 text-sm font-light text-slate-400">Nenhum colaborador encontrado.</p></div>}

      <EditTeamMemberDialog open={!!editing} onOpenChange={(value) => !value && setEditing(null)} profile={editing} />
    </div>
  );
}

function FilterButton({ active, onClick, label, clinicMode }: any) {
  return <button onClick={onClick} className={`h-9 rounded-xl px-3 text-xs font-medium transition ${active ? (clinicMode ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "bg-primary/10 text-primary") : "text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-white/5"}`}>{label}</button>;
}

function Contact({ icon: Icon, value, accent }: any) {
  return <div className="flex min-w-0 items-center gap-2.5 text-xs font-light text-slate-500"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/[0.035]"><Icon className="h-3.5 w-3.5" style={accent ? { color: accent } : undefined} /></div><span className="truncate">{value}</span></div>;
}

function JoinRequestsPanel({ mode }: { mode: "laboratory" | "clinic" }) {
  const clinicMode = mode === "clinic";
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery({ queryKey: ["join_requests"], queryFn: fetchPendingJoinRequests, refetchInterval: 10_000 });
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const options = clinicMode ? CLINIC_ROLES : ALL_ROLES;

  const approve = useMutation({ mutationFn: ({ id, role }: { id: string; role: string }) => approveJoinRequest(id, role), onSuccess: () => { toast.success("Solicitação aprovada"); qc.invalidateQueries({ queryKey: ["join_requests"] }); qc.invalidateQueries({ queryKey: ["profiles_full"] }); }, onError: (e: Error) => toast.error(e.message) });
  const reject = useMutation({ mutationFn: (id: string) => rejectJoinRequest(id), onSuccess: () => { toast.success("Solicitação recusada"); qc.invalidateQueries({ queryKey: ["join_requests"] }); }, onError: (e: Error) => toast.error(e.message) });
  if (requests.length === 0) return null;

  return (
    <div className="rounded-[24px] border border-amber-200/60 bg-amber-50/60 p-5">
      <div className="mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /><h3 className="text-sm font-medium text-amber-900">Solicitações pendentes ({requests.length})</h3></div>
      <div className="space-y-2">{requests.map((r: any) => { const profile = r.profile; const role = selectedRoles[r.id] || "USER"; return <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 md:flex-row md:items-center md:justify-between"><div><div className="text-sm font-medium text-slate-900">{profile?.full_name || profile?.email || "Usuário"}</div><div className="mt-0.5 text-xs text-slate-400">{profile?.email}</div></div><div className="flex flex-wrap items-center gap-2"><Select value={role} onValueChange={(v) => setSelectedRoles((s) => ({ ...s, [r.id]: v }))}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent>{options.map((opt) => <SelectItem key={opt} value={opt}>{ROLE_LABEL[opt] ?? opt}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={() => approve.mutate({ id: r.id, role })} disabled={approve.isPending} className={clinicMode ? "bg-[#1e8f87] hover:bg-[#177a73]" : ""}>Aceitar</Button><Button size="sm" variant="ghost" className="text-rose-500" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>Recusar</Button></div></div>; })}</div>
    </div>
  );
}
