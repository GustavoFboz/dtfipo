// @ts-nocheck
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, Link2, LogOut, RefreshCw, ShieldCheck, Unlink2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  COMPANY_SESSION_LABEL,
  fetchMyProfessionalCompanyLinks,
  fetchMySubscriptionContext,
  linkProfessionalCompany,
  switchCompanyContext,
  unlinkProfessionalCompany,
  type CompanySessionType,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/join-clinic")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      throw redirect({ to: "/auth", search: { invite: undefined, mode: undefined, returnTo: "/join-clinic" } });
    }
  },
  component: ProfessionalCompanyLinksPage,
});

function ProfessionalCompanyLinksPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inviteCode, setInviteCode] = useState("");

  const context = useQuery({ queryKey: ["subscription_context"], queryFn: fetchMySubscriptionContext, staleTime: 15_000 });
  const links = useQuery({ queryKey: ["professional_company_links"], queryFn: fetchMyProfessionalCompanyLinks, staleTime: 15_000 });

  const isProfessional = context.data?.account_type === "professional";
  const maxLinks = context.data?.professional?.max_company_links ?? 2;
  const activeLinks = (links.data ?? []).filter((link) => link.membership_status === "active" || link.membership_status === "accepted");

  const linkCompany = useMutation({
    mutationFn: () => linkProfessionalCompany(inviteCode),
    onSuccess: async (result) => {
      toast.success(`${result.clinic_name} vinculada ao seu perfil.`);
      setInviteCode("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["professional_company_links"] }),
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
      ]);
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível vincular a empresa."),
  });

  const activate = useMutation({
    mutationFn: switchCompanyContext,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
        qc.invalidateQueries({ queryKey: ["cases"] }),
      ]);
      navigate({ to: "/hub", replace: true });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível trocar de empresa."),
  });

  const unlink = useMutation({
    mutationFn: unlinkProfessionalCompany,
    onSuccess: async () => {
      toast.success("Vínculo removido.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["professional_company_links"] }),
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
      ]);
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível remover o vínculo."),
  });

  const logout = async () => {
    await supabase.auth.signOut().catch(() => undefined);
    window.location.href = "/auth";
  };

  if (context.isLoading) return <CenteredStatus text="Validando seu plano profissional…" />;

  if (!isProfessional) {
    return (
      <div className="min-h-screen bg-[#f4f8f7] px-5 py-10 dark:bg-[#080b10] dark:text-white">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <Building2 className="h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[30px] font-light tracking-[-0.04em]">Vínculos entre empresas são gerenciados pela conta Profissional.</h1>
          <p className="mt-4 text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">Contas de empresa administram a própria equipe. Se você recebeu um convite de equipe durante o cadastro, utilize o fluxo de convite da empresa.</p>
          <button onClick={() => navigate({ to: "/hub" })} className="mt-6 h-11 rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white">Voltar ao Hub</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f8f7] px-5 py-8 text-slate-950 sm:px-8 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-white">D</span> DentalFlow · Profissional</div>
          <button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-medium text-slate-500 dark:border-white/[0.08] dark:text-white/45"><LogOut className="h-3.5 w-3.5" /> Sair</button>
        </div>

        <div className="mt-12 max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#15988f]">Empresas vinculadas</div>
          <h1 className="mt-3 text-[39px] font-light leading-[1.03] tracking-[-0.045em] sm:text-[52px]">Seu perfil acompanha você entre operações.</h1>
          <p className="mt-5 max-w-2xl text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">Seu plano permite trabalhar em até {maxLinks} empresas. O código da empresa funciona como convite privado; a plataforma não expõe um diretório público de clínicas ou laboratórios.</p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#15988f]/10 text-[#15988f]"><Link2 className="h-4 w-4" /></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Novo vínculo</div><div className="mt-1 text-[14px] font-medium">Código da empresa</div></div></div>
            <p className="mt-4 text-[11px] font-light leading-5 text-slate-400">Peça ao administrador da empresa o código privado exibido nas configurações da operação.</p>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="Ex.: 1267A2F0" className="mt-5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-[13px] tracking-[0.12em] outline-none transition focus:border-[#15988f]/45 dark:border-white/[0.07] dark:bg-white/[0.025]" />
            <button disabled={inviteCode.length < 4 || linkCompany.isPending || activeLinks.length >= maxLinks} onClick={() => linkCompany.mutate()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#15988f] text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-45">{linkCompany.isPending ? "Vinculando…" : activeLinks.length >= maxLinks ? "Limite de vínculos atingido" : "Vincular empresa"}<ArrowRight className="h-4 w-4" /></button>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-light text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-[#15988f]" /> O limite também é validado no servidor.</div>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Seus vínculos</div><div className="mt-1 text-[20px] font-light tracking-[-0.025em]">{activeLinks.length} de {maxLinks} empresas</div></div><button onClick={() => links.refetch()} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 dark:border-white/[0.07]"><RefreshCw className={`h-3.5 w-3.5 ${links.isFetching ? "animate-spin" : ""}`} /></button></div>

            <div className="mt-5 space-y-3">
              {links.isLoading ? <div className="py-10 text-center text-[10px] uppercase tracking-[0.16em] text-slate-400">Carregando…</div> : activeLinks.length ? activeLinks.map((link) => (
                <div key={link.clinic_id} className={`rounded-2xl border p-4 ${link.is_current ? "border-[#15988f]/35 bg-[#15988f]/[0.045]" : "border-slate-200/75 dark:border-white/[0.06]"}`}>
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="truncate text-[13px] font-medium">{link.clinic_name}</div><div className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">{link.company_plan_name ?? "Plano empresarial"}</div></div>{link.is_current ? <span className="flex items-center gap-1 rounded-full bg-[#15988f]/10 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#15988f]"><Check className="h-3 w-3" /> Atual</span> : null}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{(link.sessions ?? []).map((session: CompanySessionType) => <span key={session} className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-medium text-slate-500 dark:bg-white/[0.05] dark:text-white/40">{COMPANY_SESSION_LABEL[session]}</span>)}</div>
                  <div className="mt-4 flex gap-2">{!link.is_current ? <button disabled={activate.isPending} onClick={() => activate.mutate(link.clinic_id)} className="h-9 rounded-xl bg-[#15988f] px-3 text-[10px] font-medium text-white">Trabalhar nesta empresa</button> : null}<button disabled={unlink.isPending} onClick={() => unlink.mutate(link.clinic_id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[10px] font-medium text-slate-400 dark:border-white/[0.07]"><Unlink2 className="h-3.5 w-3.5" /> Remover</button></div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center dark:border-white/[0.07]"><Building2 className="mx-auto h-5 w-5 text-slate-300" /><div className="mt-3 text-[12px] font-light">Nenhuma empresa vinculada.</div><div className="mt-1 text-[10px] font-light text-slate-400">Use o código privado ao lado para começar.</div></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredStatus({ text }: { text: string }) { return <div className="grid min-h-screen place-items-center bg-[#f4f8f7] text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:bg-[#080b10]">{text}</div>; }
