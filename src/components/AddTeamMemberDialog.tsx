import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Link2, ShieldCheck, UserPlus, Users2 } from "lucide-react";
import { fetchCompanyTeamInviteInfo } from "@/lib/subscriptions";

type Profession = "DENTISTA" | "CADISTA" | "PROTETICO" | "ATENDIMENTO" | "RADIOLOGISTA" | "OUTRO";

const PROFESSION_LABEL: Record<Profession, string> = {
  DENTISTA: "Dentista",
  CADISTA: "Cadista",
  PROTETICO: "Protético",
  ATENDIMENTO: "Atendimento",
  RADIOLOGISTA: "Radiologista",
  OUTRO: "Outro profissional",
};

export function AddTeamMemberDialog() {
  const [open, setOpen] = useState(false);
  const [profession, setProfession] = useState<Profession>("CADISTA");
  const invite = useQuery({
    queryKey: ["company_team_invite_info"],
    queryFn: fetchCompanyTeamInviteInfo,
    enabled: open,
    staleTime: 30_000,
  });

  const info = invite.data;
  const full = Boolean(info?.members_limit && info.members_used >= info.members_limit);
  const inactive = info?.access_mode !== "full";
  const publicOrigin = typeof window !== "undefined" && /^https?:/.test(window.location.origin)
    ? window.location.origin
    : "https://dtfipo.lovable.app";
  const inviteUrl = useMemo(() => {
    if (!info?.invite_code) return "";
    const params = new URLSearchParams({
      mode: "professional",
      invite: info.invite_code,
      profession,
    });
    return `${publicOrigin}/auth?${params.toString()}`;
  }, [info?.invite_code, profession, publicOrigin]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-[15px] font-light text-primary-foreground shadow-2xl shadow-primary/20 transition-all duration-300 hover:bg-primary/90 active:scale-95">
          <UserPlus className="h-5 w-5 stroke-[1.2px]" />
          Novo Membro
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-[2rem] border-slate-100 bg-white/95 backdrop-blur-xl sm:max-w-[520px] dark:border-white/10 dark:bg-slate-950/95">
        <DialogHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/15">
            <UserPlus className="h-6 w-6 text-primary stroke-[1.5px]" />
          </div>
          <DialogTitle className="text-2xl font-light tracking-tight text-slate-900 dark:text-slate-100">Adicionar profissional</DialogTitle>
          <DialogDescription className="font-light text-slate-500 dark:text-slate-400">
            O profissional cria o próprio e-mail e senha usando o código privado da sua empresa. A conta nasce diretamente como uma vaga da equipe.
          </DialogDescription>
        </DialogHeader>

        {invite.isLoading ? (
          <div className="py-12 text-center text-xs font-light text-slate-400">Preparando convite seguro…</div>
        ) : invite.isError || !info ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            Não foi possível carregar os dados do convite. Tente novamente após validar sua assinatura.
          </div>
        ) : (
          <div className="space-y-5 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400"><Users2 className="h-3.5 w-3.5" /> Vagas</div>
                <div className="mt-2 text-lg font-light text-slate-800 dark:text-white">{info.members_used} / {info.members_limit || "—"}</div>
                <div className="mt-1 text-[10px] font-light text-slate-400">{info.plan_name ?? "Plano empresarial"}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400"><ShieldCheck className="h-3.5 w-3.5" /> Empresa</div>
                <div className="mt-2 truncate text-sm font-medium text-slate-800 dark:text-white">{info.clinic_name}</div>
                <div className={`mt-1 text-[10px] font-medium ${inactive ? "text-amber-500" : "text-emerald-600"}`}>{inactive ? "Assinatura requer regularização" : "Assinatura ativa"}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Perfil sugerido</div>
              <Select value={profession} onValueChange={(value) => setProfession(value as Profession)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 dark:border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROFESSION_LABEL) as Profession[]).map((value) => <SelectItem key={value} value={value}>{PROFESSION_LABEL[value]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[10px] font-light leading-5 text-slate-400">O tipo vem pré-selecionado no link. A empresa poderá ajustar permissões específicas depois no painel de Equipe.</p>
            </div>

            <div className="rounded-2xl border border-slate-100 p-4 dark:border-white/[0.07]">
              <div className="flex items-center justify-between gap-3">
                <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400"><KeyRound className="h-3.5 w-3.5" /> Código da empresa</div><div className="mt-2 font-mono text-base tracking-[0.14em] text-slate-800 dark:text-white">{info.invite_code}</div></div>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(info.invite_code, "Código")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar</Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 p-4 dark:border-white/[0.07]">
              <div className="flex items-start gap-3"><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Link de cadastro</div><div className="mt-2 break-all text-[10px] font-light leading-5 text-slate-500 dark:text-slate-400">{inviteUrl}</div></div></div>
              <Button type="button" className="mt-4 w-full" disabled={full || inactive} onClick={() => copy(inviteUrl, "Link de cadastro")}><Copy className="mr-2 h-4 w-4" /> {full ? "Limite de membros atingido" : inactive ? "Regularize a assinatura" : "Copiar link para o profissional"}</Button>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[10px] font-light leading-5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> A senha não é definida pelo administrador. O profissional cria a própria credencial, e o servidor revalida código, assinatura e limite de vagas antes de concluir o vínculo.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
