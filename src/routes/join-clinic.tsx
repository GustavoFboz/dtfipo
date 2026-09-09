// @ts-nocheck
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { fetchMySubscriptionContext, linkProfessionalCompany, validateCompanyInviteCode } from "@/lib/subscriptions";

export const Route = createFileRoute("/join-clinic")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      throw redirect({ to: "/auth", search: { invite: undefined, mode: "professional", returnTo: "/join-clinic" } });
    }
  },
  component: ProfessionalCompanyRecoveryPage,
});

function ProfessionalCompanyRecoveryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inviteCode, setInviteCode] = useState("");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const context = useQuery({ queryKey: ["subscription_context"], queryFn: fetchMySubscriptionContext, staleTime: 10_000 });

  const validate = useMutation({
    mutationFn: () => validateCompanyInviteCode(inviteCode),
    onSuccess: (result) => {
      if (!result.valid) {
        setCompanyName(null);
        if (result.reason === "company_inactive") toast.error("A assinatura desta empresa não está ativa.");
        else if (result.reason === "seat_limit") toast.error("A empresa atingiu o limite de membros do plano.");
        else toast.error("Código de empresa inválido.");
        return;
      }
      setCompanyName(result.clinic_name ?? "Empresa DentalFlow");
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível validar o código."),
  });

  const link = useMutation({
    mutationFn: async () => {
      const checked = await validateCompanyInviteCode(inviteCode);
      if (!checked.valid) throw new Error("O código não está disponível para vínculo.");
      return linkProfessionalCompany(inviteCode);
    },
    onSuccess: async (result) => {
      toast.success(`Perfil vinculado a ${result.clinic_name}.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      navigate({ to: "/hub", replace: true });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível concluir o vínculo."),
  });

  const logout = async () => {
    await supabase.auth.signOut().catch(() => undefined);
    window.location.href = "/auth";
  };

  if (context.isLoading) return <CenteredStatus text="Validando seu perfil…" />;

  if (context.data?.account_type !== "professional") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f8f7] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <Building2 className="h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[30px] font-light tracking-[-0.04em]">Este vínculo é exclusivo para contas profissionais.</h1>
          <p className="mt-4 text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">Contas empresariais administram a equipe pelo código privado da empresa.</p>
          <button onClick={() => navigate({ to: "/hub" })} className="mt-6 h-11 rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white">Voltar ao Hub</button>
        </div>
      </div>
    );
  }

  if (context.data.active_clinic_id) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f8f7] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <ShieldCheck className="h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[30px] font-light tracking-[-0.04em]">Seu perfil já pertence a uma empresa.</h1>
          <p className="mt-4 text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">A 0.3.2 não permite que uma conta profissional seja vinculada a várias empresas. Seu login sempre abre no contexto empresarial já associado.</p>
          <button onClick={() => navigate({ to: "/hub", replace: true })} className="mt-6 h-11 rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white">Abrir DentalFlow</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f8f7] px-5 py-8 text-slate-950 sm:px-8 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-white">D</span> DentalFlow · Recuperação de vínculo</div>
          <button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-medium text-slate-500 dark:border-white/[0.08] dark:text-white/45"><LogOut className="h-3.5 w-3.5" /> Sair</button>
        </div>

        <div className="mt-14 rounded-[30px] border border-slate-200/80 bg-white p-7 sm:p-10 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#15988f]/10 text-[#15988f]"><KeyRound className="h-5 w-5" /></div>
          <div className="mt-7 text-[10px] font-semibold uppercase tracking-[0.19em] text-[#15988f]">Código da empresa</div>
          <h1 className="mt-3 text-[36px] font-light leading-[1.03] tracking-[-0.045em] sm:text-[48px]">Recupere um perfil antigo sem vínculo.</h1>
          <p className="mt-5 max-w-2xl text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">Novas contas profissionais já exigem o código durante o cadastro. Esta etapa existe somente para perfis anteriores à 0.3.2.</p>

          <input value={inviteCode} onChange={(event) => { setInviteCode(event.target.value.toUpperCase().replace(/\s+/g, "")); setCompanyName(null); }} placeholder="Ex.: 1267A2F0" className="mt-7 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-[13px] tracking-[0.12em] outline-none transition focus:border-[#15988f]/45 dark:border-white/[0.07] dark:bg-white/[0.025]" />
          {companyName ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-300">Código confirmado · {companyName}</div> : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={inviteCode.length < 4 || validate.isPending} onClick={() => validate.mutate()} className="h-11 rounded-xl border border-slate-200 px-5 text-[11px] font-medium disabled:opacity-40 dark:border-white/[0.08]">{validate.isPending ? "Validando…" : "Validar código"}</button>
            <button disabled={!companyName || link.isPending} onClick={() => link.mutate()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#15988f] px-5 text-[11px] font-medium text-white disabled:opacity-40">{link.isPending ? "Vinculando…" : "Concluir vínculo"}<ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredStatus({ text }: { text: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#f4f8f7] text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:bg-[#080b10]">{text}</div>;
}
