import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Check,
  FlaskConical,
  Layers3,
  LockKeyhole,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

import { BillingCheckoutPanel } from "@/components/billing/BillingCheckoutPanel";

import {
  COMPANY_SESSION_LABEL,
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
    staleTime: 20_000,
    retry: 1,
  });
  if (context.isLoading) return <GateStatus text="Validando assinatura…" />;

  if (context.isError || context.data == null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-7 text-center dark:border-white/[0.07] dark:bg-[#0d1218]">
          <ShieldCheck className="mx-auto h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[25px] font-light tracking-[-0.035em]">
            Não foi possível validar a assinatura.
          </h1>
          <p className="mt-3 text-[12px] font-light leading-6 text-slate-500 dark:text-white/45">
            Por segurança, o DentalFlow não libera a operação sem confirmar o plano. No Desktop,
            apenas um período previamente validado e ainda vigente pode continuar offline.
          </p>
          <button
            onClick={() => context.refetch()}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#15988f] px-4 text-[11px] font-medium text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (context.data.effective_access === "needs_company_link") return <ProfessionalLinkRequired />;

  if (context.data.effective_access === "full") {
    return children;
  }

  return <BillingRequired context={context.data} />;
}

function ProfessionalLinkRequired() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-5 py-10 text-slate-950 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-4xl items-center justify-center">
        <div className="w-full rounded-[30px] border border-slate-200/70 bg-white p-8 sm:p-12 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#15988f]/10 text-[#15988f]">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">
            Conta profissional
          </div>
          <h1 className="mt-3 max-w-2xl text-[34px] font-light leading-[1.05] tracking-[-0.04em] sm:text-[46px]">
            Este perfil precisa pertencer a uma empresa.
          </h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">
            Contas profissionais não possuem assinatura própria. Novos cadastros exigem o código da
            empresa; esta tela existe somente para recuperar um perfil antigo ainda sem vínculo.
          </p>
          <Link
            to="/join-clinic"
            className="mt-8 inline-flex h-11 items-center rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white"
          >
            Informar código da empresa
          </Link>
        </div>
      </div>
    </div>
  );
}

function BillingRequired({ context }: { context: MySubscriptionContext }) {
  const isManager = context.account_type === "company_admin";
  const plans = useQuery({
    queryKey: ["billing_plans", "company"],
    queryFn: fetchBillingPlans,
    staleTime: 5 * 60_000,
  });
  const currentPlanCode = context.company?.plan_code ?? "company_initial";
  const [selectedPlan, setSelectedPlan] = useState(currentPlanCode);
  const [sessions, setSessions] = useState<CompanySessionType[]>(
    context.company?.sessions?.length ? context.company.sessions : ["laboratory"],
  );
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const selected = useMemo(
    () => plans.data?.find((plan) => plan.code === selectedPlan) ?? null,
    [plans.data, selectedPlan],
  );

  useEffect(() => {
    if (!selected) return;
    setSessions((current) => {
      const valid = current
        .filter((item) => ALL_SESSIONS.includes(item))
        .slice(0, Math.max(1, selected.max_sessions));
      return valid.length ? valid : ["laboratory"];
    });
  }, [selected]);

  const toggleSession = (session: CompanySessionType) => {
    if (!selected || checkoutLocked) return;
    setSessions((current) => {
      if (current.includes(session))
        return current.length === 1 ? current : current.filter((item) => item !== session);
      if (current.length >= selected.max_sessions) return [...current.slice(1), session];
      return [...current, session];
    });
  };

  if (!isManager) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f4f8f7] px-5 dark:bg-[#080b10] dark:text-white">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <LockKeyhole className="h-6 w-6 text-[#15988f]" />
          <h1 className="mt-5 text-[30px] font-light tracking-[-0.04em]">
            A assinatura da empresa precisa ser regularizada.
          </h1>
          <p className="mt-4 text-[13px] font-light leading-6 text-slate-500 dark:text-white/45">
            Seu cadastro continua preservado, mas a operação inteira está suspensa. Somente o
            administrador da empresa pode concluir ou renovar o pagamento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f4f8f7] px-4 py-8 text-slate-950 sm:px-6 dark:bg-[#080b10] dark:text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#15988f] text-white">
              D
            </span>{" "}
            DentalFlow · Assinatura
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> Cobrança protegida
          </div>
        </div>

        <div className="mt-12 max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#15988f]">
            {context.company?.status === "pending_checkout"
              ? "Ativação da empresa"
              : "Pagamento necessário"}
          </div>
          <h1 className="mt-3 text-[38px] font-light leading-[1.02] tracking-[-0.045em] sm:text-[54px]">
            Ative ou regularize sua assinatura para continuar operando.
          </h1>
          <p className="mt-5 max-w-2xl text-[14px] font-light leading-7 text-slate-500 dark:text-white/45">
            O período pago é a autoridade de acesso. Se a renovação não for confirmada no próximo
            ciclo, Laboratório, Clínica e Radiologia ficam suspensos até a regularização — sem
            apagar nenhum dado.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {(plans.data ?? []).map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              active={selectedPlan === plan.code}
              disabled={checkoutLocked}
              onClick={() => {
                if (checkoutLocked) return;
                setSelectedPlan(plan.code);
              }}
            />
          ))}
        </div>

        {selected ? (
          <section className="mt-6 rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Ambientes contratados
                </div>
                <div className="mt-2 text-[20px] font-light">
                  Escolha{" "}
                  {selected.max_sessions === 1
                    ? "1 ambiente"
                    : `até ${selected.max_sessions} ambientes`}
                </div>
              </div>
              <div className="text-[10px] font-light text-slate-400">
                Mudanças de plano/sessão só entram em vigor depois do pagamento confirmado.
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {ALL_SESSIONS.map((session) => {
                const active = sessions.includes(session);
                const Icon =
                  session === "laboratory"
                    ? FlaskConical
                    : session === "clinic"
                      ? Stethoscope
                      : RadioTower;
                return (
                  <button
                    key={session}
                    type="button"
                    disabled={checkoutLocked}
                    onClick={() => toggleSession(session)}
                    className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-[#15988f]/45 bg-[#15988f]/[0.055]" : "border-slate-200/80 dark:border-white/[0.07]"}`}
                  >
                    <Icon
                      className={`h-5 w-5 ${active ? "text-[#15988f]" : "text-slate-400"}`}
                      strokeWidth={1.5}
                    />
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[14px] font-medium">
                        {COMPANY_SESSION_LABEL[session]}
                      </span>
                      {active ? <Check className="h-4 w-4 text-[#15988f]" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          {selected && context.active_clinic_id ? (
            <BillingCheckoutPanel
              clinicId={context.active_clinic_id}
              plan={selected}
              sessions={sessions}
              onCheckoutReady={() => setCheckoutLocked(true)}
            />
          ) : null}

          <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">
              <LockKeyhole className="h-3.5 w-3.5" /> Regras do ciclo
            </div>
            <ul className="mt-5 space-y-4 text-[12px] font-light leading-5 text-slate-500 dark:text-white/42">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Empresa é a única entidade
                cobrada.
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Profissionais consomem vagas
                do plano da empresa.
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#15988f]" /> O plano só muda depois da
                confirmação do pagamento.
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Período vencido sem renovação
                bloqueia a operação.
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#15988f]" /> Suspensão preserva pacientes,
                casos, exames e arquivos.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  active,
  disabled,
  onClick,
}: {
  plan: BillingPlan;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative rounded-[24px] border p-6 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-[#15988f]/50 bg-white ring-1 ring-[#15988f]/15 dark:bg-[#0d1218]" : "border-slate-200/75 bg-white/75 dark:border-white/[0.06] dark:bg-white/[0.025]"}`}
    >
      {plan.code === "company_advanced" ? (
        <span className="absolute right-5 top-5 rounded-full bg-[#15988f]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#15988f]">
          Completo
        </span>
      ) : null}
      <Layers3
        className={`h-5 w-5 ${active ? "text-[#15988f]" : "text-slate-400"}`}
        strokeWidth={1.5}
      />
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/48">
        {plan.name}
      </div>
      <div className="mt-3 text-[31px] font-light tracking-[-0.035em]">
        {formatPlanPrice(plan.monthly_price_cents, plan.currency)}
        <span className="ml-1 text-[11px] font-light tracking-normal text-slate-400">/mês</span>
      </div>
      <p className="mt-3 min-h-10 text-[11px] font-light leading-5 text-slate-400">
        {plan.description}
      </p>
      <div className="mt-5 space-y-2 text-[11px] font-light text-slate-500 dark:text-white/45">
        <div>
          {plan.max_sessions} sessão{plan.max_sessions === 1 ? "" : "ões"} empresarial
          {plan.max_sessions === 1 ? "" : "is"}
        </div>
        <div>Até {plan.max_members} membros</div>
        <div>{formatStorage(plan.storage_bytes)} incluídos</div>
      </div>
    </button>
  );
}

function GateStatus({ text }: { text: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f8] text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 dark:bg-[#080b10]">
      {text}
    </div>
  );
}
