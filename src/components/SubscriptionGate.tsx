import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Check, CreditCard, Layers3, LockKeyhole, RadioTower, RefreshCw, ShieldCheck, Stethoscope, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  COMPANY_SESSION_LABEL,
  configureCompanySessions,
  createCheckoutIntent,
  fetchBillingPlans,
  fetchMySubscriptionContext,
  formatPlanPrice,
  formatStorage,
  type BillingPlan,
  type CompanySessionType,
  type MySubscriptionContext,
} from "@/lib/subscriptions";

const ALL_SESSIONS: CompanySessionType[] = ["laboratory", "clinic", "radiology"];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const context = useQuery({
    queryKey: ["subscription_context"],
    queryFn: fetchMySubscriptionContext,
    staleTime: 30_000,
    retry: 1,
  });

  if (context.isLoading) return <GateStatus text="Validando assinatura…" />;

  // Billing state is security-sensitive: web/network failures never silently
  // become full access. Desktop offline continuity is handled by the verified
  // SQLite snapshot inside fetchMySubscriptionContext().
  if (context.isError || context.data == null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-7 text-center dark:border-white/[0.07] dark:bg-[#0d1218]">
          <ShieldCheck className="mx-auto h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[25px] font-light tracking-[-0.035em]">Não foi possível validar sua assinatura.</h1>
          <p className="mt-3 text-[12px] font-light leading-6 text-slate-500 dark:text-white/45">Por segurança, o DentalFlow não liberou operações sem confirmar o plano. No Desktop, uma assinatura previamente validada continua disponível offline pelo cache local.</p>
          <button onClick={() => context.refetch()} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#15988f] px-4 text-[11px] font-medium text-white"><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</button>
        </div>
      </div>
    );
  }

  const access = context.data.effective_access;
  if (access === "full") return <>{children}</>;
  if (access === "needs_company_link") return <ProfessionalLinkRequired context={context.data} />;
  return <BillingRequired context={context.data} readOnly={access === "read_only"} />;
}

function ProfessionalLinkRequired({ context }: { context: MySubscriptionContext }) {
  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-5 py-10 text-slate-950 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-4xl items-center justify-center">
        <div className="w-full rounded-[30px] border border-slate-200/70 bg-white p-8 sm:p-12 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#15988f]/10 text-[#15988f]"><Building2 className="h-5 w-5" /></div>
          <div className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">Conta profissional ativa</div>
          <h1 className="mt-3 max-w-2xl text-[34px] font-light leading-[1.05] tracking-[-0.04em] sm:text-[46px]">Conecte seu perfil a uma empresa para começar a operar.</h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">O plano Profissional acompanha dentistas, CADISTAs, protéticos e outros especialistas entre até {context.professional?.max_company_links ?? 2} empresas. Ele não cria um ambiente empresarial independente.</p>
          <Link to="/join-clinic" className="mt-8 inline-flex h-11 items-center rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white">Vincular a uma empresa</Link>
        </div>
      </div>
    </div>
  );
}

function BillingRequired({ context, readOnly }: { context: MySubscriptionContext; readOnly: boolean }) {
  const qc = useQueryClient();
  const companyScope = context.account_type !== "professional";
  const scope = companyScope ? "company" : "professional";
  const plans = useQuery({ queryKey: ["billing_plans", scope], queryFn: () => fetchBillingPlans(scope), staleTime: 5 * 60_000 });
  const currentPlanCode = context.company?.plan_code ?? context.professional?.plan_code ?? (companyScope ? "company_initial" : "professional");
  const [selectedPlan, setSelectedPlan] = useState(currentPlanCode);
  const [sessions, setSessions] = useState<CompanySessionType[]>(context.company?.sessions?.length ? context.company.sessions : ["laboratory"]);
  const [preparedIntent, setPreparedIntent] = useState<{ id: string; amount: number; currency: string; plan: string } | null>(null);
  const selected = useMemo(() => plans.data?.find((plan) => plan.code === selectedPlan) ?? null, [plans.data, selectedPlan]);

  const prepare = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecione um plano.");
      const clinicId = context.active_clinic_id ?? null;
      if (companyScope && !clinicId) throw new Error("Empresa não encontrada no contexto atual.");
      const intent = await createCheckoutIntent(selected.code, companyScope ? clinicId : null);
      if (companyScope && clinicId) {
        const allowed = sessions.slice(0, Math.max(1, selected.max_sessions));
        if (!allowed.length) throw new Error("Selecione ao menos um ambiente de trabalho.");
        await configureCompanySessions(clinicId, allowed);
      }
      return intent;
    },
    onSuccess: (intent) => {
      setPreparedIntent({ id: intent.checkout_intent_id, amount: intent.amount_cents, currency: intent.currency, plan: intent.plan_name });
      void qc.invalidateQueries({ queryKey: ["subscription_context"] });
      toast.success("Checkout preparado com segurança.");
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível preparar o pagamento."),
  });

  const toggleSession = (session: CompanySessionType) => {
    if (!selected) return;
    setSessions((current) => {
      if (current.includes(session)) return current.length === 1 ? current : current.filter((item) => item !== session);
      if (current.length >= selected.max_sessions) return [...current.slice(1), session];
      return [...current, session];
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-4 py-8 text-slate-950 sm:px-6 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-5"><div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-white">D</span> DentalFlow · Assinatura</div><div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" /> Ambiente protegido</div></div>

        <div className="mt-12 max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">{readOnly ? "Regularização necessária" : "Ativação da conta"}</div>
          <h1 className="mt-3 text-[38px] font-light leading-[1.02] tracking-[-0.045em] sm:text-[54px]">{readOnly ? "Sua operação está preservada, mas o acesso operacional foi pausado." : "Escolha a estrutura ideal para sua operação."}</h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">O status de pagamento controla a permissão de operar, sem apagar dados. O checkout abaixo já cria assinatura, valor e identificador; a cobrança efetiva será conectada à API do provedor.</p>
        </div>

        <div className={`mt-10 grid gap-4 ${companyScope ? "lg:grid-cols-3" : "max-w-md"}`}>
          {(plans.data ?? []).map((plan) => <PlanCard key={plan.code} plan={plan} active={selectedPlan === plan.code} onClick={() => { setSelectedPlan(plan.code); setPreparedIntent(null); if (plan.max_sessions > 0) setSessions((current) => current.slice(0, Math.max(1, plan.max_sessions))); }} />)}
        </div>

        {companyScope && selected ? (
          <section className="mt-6 rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Sessões da empresa</div><div className="mt-2 text-[20px] font-light">Escolha até {selected.max_sessions} ambiente{selected.max_sessions === 1 ? "" : "s"}</div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {ALL_SESSIONS.map((session) => {
                const active = sessions.includes(session);
                const Icon = session === "laboratory" ? Wrench : session === "clinic" ? Stethoscope : RadioTower;
                return <button key={session} type="button" onClick={() => toggleSession(session)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#15988f]/45 bg-[#15988f]/[0.055]" : "border-slate-200/80 dark:border-white/[0.07]"}`}><Icon className={`h-5 w-5 ${active ? "text-[#15988f]" : "text-slate-400"}`} strokeWidth={1.5} /><div className="mt-4 flex items-center justify-between"><span className="text-[14px] font-medium">{COMPANY_SESSION_LABEL[session]}</span>{active ? <Check className="h-4 w-4 text-[#15988f]" /> : null}</div><div className="mt-1 text-[11px] font-light text-slate-400">{session === "radiology" ? "Imagens DICOM e exames." : session === "clinic" ? "Pacientes e operação clínica." : "Casos e produção protética."}</div></button>;
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/[0.06]"><CreditCard className="h-4 w-4" /></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">Pagamento</div><div className="mt-1 text-[15px] font-medium">Checkout preparado para integração</div></div></div>
            <p className="mt-5 text-[12px] font-light leading-6 text-slate-500 dark:text-white/40">A confirmação futura virá apenas do servidor/webhook do provedor. O navegador não consegue marcar uma assinatura como paga.</p>
            {preparedIntent ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Checkout criado</div><div className="mt-2 text-[17px] font-light">{preparedIntent.plan} · {formatPlanPrice(preparedIntent.amount, preparedIntent.currency)}</div><div className="mt-1 break-all font-mono text-[9px] text-emerald-700/60">{preparedIntent.id}</div></div> : null}
            <button type="button" disabled={!selected || prepare.isPending} onClick={() => prepare.mutate()} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white disabled:opacity-50">{prepare.isPending ? "Preparando…" : "Continuar para pagamento"}</button>
          </section>
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400"><LockKeyhole className="h-3.5 w-3.5" /> Segurança</div><ul className="mt-5 space-y-4 text-[12px] font-light leading-5 text-slate-500 dark:text-white/42"><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Status controlado no servidor.</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Eventos futuros são idempotentes.</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Suspensão preserva todos os dados.</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> IPO interno permanece no Avançado.</li></ul></section>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, active, onClick }: { plan: BillingPlan; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative rounded-[24px] border p-6 text-left transition ${active ? "border-[#15988f]/50 bg-white ring-1 ring-[#15988f]/15 dark:bg-[#0d1218]" : "border-slate-200/75 bg-white/75 dark:border-white/[0.06] dark:bg-white/[0.025]"}`}>
      {plan.code === "company_advanced" ? <span className="absolute right-5 top-5 rounded-full bg-[#15988f]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#15988f]">Completo</span> : null}
      <Layers3 className={`h-5 w-5 ${active ? "text-[#15988f]" : "text-slate-400"}`} strokeWidth={1.5} />
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/48">{plan.name}</div>
      <div className="mt-3 text-[31px] font-light tracking-[-0.035em]">{formatPlanPrice(plan.monthly_price_cents, plan.currency)}<span className="ml-1 text-[11px] font-light tracking-normal text-slate-400">/mês</span></div>
      <p className="mt-3 min-h-10 text-[11px] font-light leading-5 text-slate-400">{plan.description}</p>
      <div className="mt-5 space-y-2 text-[11px] font-light text-slate-500 dark:text-white/45">{plan.account_scope === "company" ? <><div>{plan.max_sessions} sessão{plan.max_sessions === 1 ? "" : "ões"}</div><div>Até {plan.max_members} membros</div><div>{formatStorage(plan.storage_bytes)} incluídos</div></> : <><div>Até {plan.max_company_links} empresas</div><div>Perfil profissional único</div><div>Sem ambiente independente</div></>}</div>
    </button>
  );
}

function GateStatus({ text }: { text: string }) { return <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400 dark:bg-[#080b10]">{text}</div>; }
