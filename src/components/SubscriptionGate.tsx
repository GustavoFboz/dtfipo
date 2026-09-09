import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Check,
  CreditCard,
  FlaskConical,
  Layers3,
  LockKeyhole,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  TestTube2,
} from "lucide-react";
import { toast } from "sonner";

import {
  COMPANY_SESSION_LABEL,
  confirmSandboxPayment,
  createCheckoutIntent,
  fetchBillingPlans,
  fetchBillingTestCapability,
  fetchMySubscriptionContext,
  formatPlanPrice,
  formatStorage,
  redeemBillingTestToken,
  simulateSandboxNonpayment,
  type BillingPlan,
  type CompanySessionType,
  type MySubscriptionContext,
} from "@/lib/subscriptions";

const ALL_SESSIONS: CompanySessionType[] = ["laboratory", "clinic", "radiology"];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const context = useQuery({
    queryKey: ["subscription_context"],
    queryFn: fetchMySubscriptionContext,
    staleTime: 20_000,
    retry: 1,
  });
  const sandbox = useQuery({
    queryKey: ["billing_test_capability"],
    queryFn: fetchBillingTestCapability,
    staleTime: 30_000,
    retry: 0,
  });

  const simulateExpiry = useMutation({
    mutationFn: async () => {
      const clinicId = context.data?.active_clinic_id;
      if (!clinicId) throw new Error("Empresa não encontrada.");
      return simulateSandboxNonpayment(clinicId);
    },
    onSuccess: async () => {
      toast.warning("Mês sem pagamento simulado. O acesso operacional foi suspenso.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
      ]);
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível simular o vencimento."),
  });

  if (context.isLoading) return <GateStatus text="Validando assinatura…" />;

  if (context.isError || context.data == null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-7 text-center dark:border-white/[0.07] dark:bg-[#0d1218]">
          <ShieldCheck className="mx-auto h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[25px] font-light tracking-[-0.035em]">Não foi possível validar a assinatura.</h1>
          <p className="mt-3 text-[12px] font-light leading-6 text-slate-500 dark:text-white/45">
            Por segurança, o DentalFlow não libera a operação sem confirmar o plano. No Desktop, apenas um período previamente validado e ainda vigente pode continuar offline.
          </p>
          <button onClick={() => context.refetch()} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#15988f] px-4 text-[11px] font-medium text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (context.data.effective_access === "needs_company_link") return <ProfessionalLinkRequired />;

  if (context.data.effective_access === "full") {
    return (
      <>
        {children}
        {sandbox.data?.enabled && context.data.account_type === "company_admin" && context.data.active_clinic_id ? (
          <div className="fixed bottom-4 right-4 z-[2147480000] rounded-2xl border border-amber-300/60 bg-amber-50/95 p-3 shadow-xl backdrop-blur dark:border-amber-400/20 dark:bg-[#1b1609]/95">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-300">
              <TestTube2 className="h-3.5 w-3.5" /> Billing QA
            </div>
            <button
              disabled={simulateExpiry.isPending}
              onClick={() => simulateExpiry.mutate()}
              className="mt-2 h-8 rounded-lg border border-amber-300 px-3 text-[10px] font-medium text-amber-800 disabled:opacity-50 dark:border-amber-400/25 dark:text-amber-200"
            >
              Simular próximo mês sem pagamento
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return <BillingRequired context={context.data} sandboxEnabled={Boolean(sandbox.data?.enabled)} />;
}

function ProfessionalLinkRequired() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-5 py-10 text-slate-950 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-4xl items-center justify-center">
        <div className="w-full rounded-[30px] border border-slate-200/70 bg-white p-8 sm:p-12 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#15988f]/10 text-[#15988f]"><Building2 className="h-5 w-5" /></div>
          <div className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">Conta profissional</div>
          <h1 className="mt-3 max-w-2xl text-[34px] font-light leading-[1.05] tracking-[-0.04em] sm:text-[46px]">Este perfil precisa pertencer a uma empresa.</h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">
            Contas profissionais não possuem assinatura própria. Novos cadastros exigem o código da empresa; esta tela existe somente para recuperar um perfil antigo ainda sem vínculo.
          </p>
          <Link to="/join-clinic" className="mt-8 inline-flex h-11 items-center rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white">Informar código da empresa</Link>
        </div>
      </div>
    </div>
  );
}

function BillingRequired({ context, sandboxEnabled }: { context: MySubscriptionContext; sandboxEnabled: boolean }) {
  const qc = useQueryClient();
  const isManager = context.account_type === "company_admin";
  const plans = useQuery({ queryKey: ["billing_plans", "company"], queryFn: fetchBillingPlans, staleTime: 5 * 60_000 });
  const currentPlanCode = context.company?.plan_code ?? "company_initial";
  const [selectedPlan, setSelectedPlan] = useState(currentPlanCode);
  const [sessions, setSessions] = useState<CompanySessionType[]>(context.company?.sessions?.length ? context.company.sessions : ["laboratory"]);
  const [preparedIntent, setPreparedIntent] = useState<{ id: string; amount: number; currency: string; plan: string } | null>(null);
  const [qaToken, setQaToken] = useState("");
  const selected = useMemo(() => plans.data?.find((plan) => plan.code === selectedPlan) ?? null, [plans.data, selectedPlan]);

  useEffect(() => {
    if (!selected) return;
    setSessions((current) => {
      const valid = current.filter((item) => ALL_SESSIONS.includes(item)).slice(0, Math.max(1, selected.max_sessions));
      return valid.length ? valid : ["laboratory"];
    });
  }, [selected?.code, selected?.max_sessions]);

  const toggleSession = (session: CompanySessionType) => {
    if (!selected) return;
    setPreparedIntent(null);
    setSessions((current) => {
      if (current.includes(session)) return current.length === 1 ? current : current.filter((item) => item !== session);
      if (current.length >= selected.max_sessions) return [...current.slice(1), session];
      return [...current, session];
    });
  };

  const prepare = useMutation({
    mutationFn: async () => {
      if (!isManager) throw new Error("Somente o administrador da empresa pode gerenciar a assinatura.");
      if (!selected || !context.active_clinic_id) throw new Error("Plano ou empresa não encontrado.");
      if (!sessions.length || sessions.length > selected.max_sessions) throw new Error("Selecione os ambientes permitidos pelo plano.");
      return createCheckoutIntent(selected.code, context.active_clinic_id, sessions);
    },
    onSuccess: (intent) => {
      setPreparedIntent({ id: intent.checkout_intent_id, amount: intent.amount_cents, currency: intent.currency, plan: intent.plan_name });
      toast.success(sandboxEnabled ? "Checkout de teste preparado." : "Checkout preparado com segurança.");
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível preparar o pagamento."),
  });

  const enrollSandbox = useMutation({
    mutationFn: () => redeemBillingTestToken(qaToken),
    onSuccess: async () => {
      setQaToken("");
      toast.success("Modo de teste liberado para esta conta.");
      await qc.invalidateQueries({ queryKey: ["billing_test_capability"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Código de teste inválido."),
  });

  const paySandbox = useMutation({
    mutationFn: async () => {
      if (!preparedIntent) throw new Error("Gere o checkout primeiro.");
      return confirmSandboxPayment(preparedIntent.id);
    },
    onSuccess: async () => {
      toast.success("Pagamento de teste confirmado. Assinatura ativa por 30 dias.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription_context"] }),
        qc.invalidateQueries({ queryKey: ["clinic_context"] }),
        qc.invalidateQueries({ queryKey: ["billing_plans"] }),
      ]);
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível confirmar o pagamento de teste."),
  });

  if (!isManager) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f4f8f7] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <LockKeyhole className="h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[30px] font-light tracking-[-0.04em]">A assinatura da empresa precisa ser regularizada.</h1>
          <p className="mt-4 text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">
            Seu cadastro continua preservado, mas a operação inteira está suspensa. Somente o administrador da empresa pode concluir ou renovar o pagamento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-4 py-8 text-slate-950 sm:px-6 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-white">D</span> DentalFlow · Assinatura</div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" /> Cobrança protegida</div>
        </div>

        <div className="mt-12 max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">{context.company?.status === "pending_checkout" ? "Ativação da empresa" : "Pagamento necessário"}</div>
          <h1 className="mt-3 text-[38px] font-light leading-[1.02] tracking-[-0.045em] sm:text-[54px]">Ative ou regularize sua assinatura para continuar operando.</h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">
            O período pago é a autoridade de acesso. Se a renovação não for confirmada no próximo ciclo, Laboratório, Clínica e Radiologia ficam suspensos até a regularização — sem apagar nenhum dado.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {(plans.data ?? []).map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              active={selectedPlan === plan.code}
              onClick={() => {
                setSelectedPlan(plan.code);
                setPreparedIntent(null);
              }}
            />
          ))}
        </div>

        {selected ? (
          <section className="mt-6 rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Ambientes contratados</div><div className="mt-2 text-[20px] font-light">Escolha {selected.max_sessions === 1 ? "1 ambiente" : `até ${selected.max_sessions} ambientes`}</div></div>
              <div className="text-[10px] font-light text-slate-400">Mudanças de plano/sessão só entram em vigor depois do pagamento confirmado.</div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {ALL_SESSIONS.map((session) => {
                const active = sessions.includes(session);
                const Icon = session === "laboratory" ? FlaskConical : session === "clinic" ? Stethoscope : RadioTower;
                return (
                  <button key={session} type="button" onClick={() => toggleSession(session)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#15988f]/45 bg-[#15988f]/[0.055]" : "border-slate-200/80 dark:border-white/[0.07]"}`}>
                    <Icon className={`h-5 w-5 ${active ? "text-[#15988f]" : "text-slate-400"}`} strokeWidth={1.5} />
                    <div className="mt-4 flex items-center justify-between"><span className="text-[14px] font-medium">{COMPANY_SESSION_LABEL[session]}</span>{active ? <Check className="h-4 w-4 text-[#15988f]" /> : null}</div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/[0.06]"><CreditCard className="h-4 w-4" /></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">Checkout</div><div className="mt-1 text-[15px] font-medium">{sandboxEnabled ? "Sandbox de cobrança 0.3.2" : "Pagamento recorrente"}</div></div></div>
            <p className="mt-5 text-[12px] font-light leading-6 text-slate-500 dark:text-white/40">
              O checkout guarda plano, valor e ambientes desejados sem liberar limites antecipadamente. Em produção, somente o webhook assinado do provedor poderá ativar ou renovar a assinatura.
            </p>
            {preparedIntent ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Checkout criado</div><div className="mt-2 text-[17px] font-light">{preparedIntent.plan} · {formatPlanPrice(preparedIntent.amount, preparedIntent.currency)}</div><div className="mt-1 break-all font-mono text-[9px] text-emerald-700/60">{preparedIntent.id}</div></div> : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={!selected || prepare.isPending} onClick={() => prepare.mutate()} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white disabled:opacity-50">{prepare.isPending ? "Preparando…" : "Gerar checkout"}</button>
              {sandboxEnabled && preparedIntent ? <button type="button" disabled={paySandbox.isPending} onClick={() => paySandbox.mutate()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 text-[12px] font-medium text-amber-800 disabled:opacity-50"><TestTube2 className="h-4 w-4" /> {paySandbox.isPending ? "Confirmando…" : "Simular pagamento aprovado"}</button> : null}
            </div>

            {!sandboxEnabled ? (
              <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/[0.06]">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">Teste controlado da 0.3.2</div>
                <p className="mt-2 text-[10px] font-light leading-5 text-slate-400">Se você recebeu um código QA de uso único, informe-o abaixo para validar o ciclo completo antes da API real de pagamento.</p>
                <div className="mt-3 flex gap-2"><input value={qaToken} onChange={(event) => setQaToken(event.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="Código QA" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-[11px] tracking-[0.08em] outline-none focus:border-[#15988f]/45 dark:border-white/[0.07] dark:bg-white/[0.025]" /><button type="button" disabled={qaToken.length < 8 || enrollSandbox.isPending} onClick={() => enrollSandbox.mutate()} className="h-10 rounded-xl border border-slate-200 px-4 text-[10px] font-medium disabled:opacity-40 dark:border-white/[0.08]">Ativar teste</button></div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400"><LockKeyhole className="h-3.5 w-3.5" /> Regras do ciclo</div>
            <ul className="mt-5 space-y-4 text-[12px] font-light leading-5 text-slate-500 dark:text-white/42">
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Empresa é a única entidade cobrada.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Profissionais consomem vagas do plano da empresa.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> O plano só muda depois da confirmação do pagamento.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Período vencido sem renovação bloqueia a operação.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Suspensão preserva pacientes, casos, exames e arquivos.</li>
            </ul>
          </section>
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
      <div className="mt-5 space-y-2 text-[11px] font-light text-slate-500 dark:text-white/45"><div>{plan.max_sessions} sessão{plan.max_sessions === 1 ? "" : "ões"} empresarial{plan.max_sessions === 1 ? "" : "is"}</div><div>Até {plan.max_members} membros</div><div>{formatStorage(plan.storage_bytes)} incluídos</div></div>
    </button>
  );
}

function GateStatus({ text }: { text: string }) {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 dark:bg-[#080b10]">{text}</div>;
}
