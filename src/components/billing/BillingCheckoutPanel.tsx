import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  COMPANY_SESSION_LABEL,
  createAsaasCheckout,
  createCheckoutIntent,
  fetchCompanyBillingProfile,
  formatPlanPrice,
  friendlyBillingError,
  openAsaasCheckoutPayment,
  upsertCompanyBillingProfile,
  type AsaasCheckout,
  type BillingPlan,
  type CompanyBillingProfileInput,
  type CompanySessionType,
} from "@/lib/subscriptions";

const EMPTY_PROFILE: CompanyBillingProfileInput = {
  legalName: "",
  taxId: "",
  billingEmail: "",
  billingPhone: "",
  postalCode: "",
  addressLine: "",
  addressNumber: "",
  addressComplement: "",
  district: "",
  city: "",
  state: "",
};

const INPUT_CLASS =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[12px] outline-none transition placeholder:text-slate-300 focus:border-[#15988f]/55 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.035] dark:placeholder:text-white/20 dark:focus:bg-white/[0.05]";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function validateProfile(input: CompanyBillingProfileInput): string | null {
  const taxId = digits(input.taxId);
  const phone = digits(input.billingPhone);
  const postalCode = digits(input.postalCode);
  if (input.legalName.trim().length < 2) return "Informe o nome ou a razão social.";
  if (![11, 14].includes(taxId.length)) return "Informe um CPF ou CNPJ válido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.billingEmail.trim())) {
    return "Informe um e-mail de cobrança válido.";
  }
  if (phone.length < 10 || phone.length > 13) return "Informe um telefone com DDD.";
  if (postalCode.length !== 8) return "Informe um CEP com 8 números.";
  if (!input.addressLine.trim() || !input.addressNumber.trim())
    return "Informe o endereço e o número.";
  if (!input.district.trim() || !input.city.trim()) return "Informe o bairro e a cidade.";
  if (!/^[A-Za-z]{2}$/.test(input.state.trim())) return "Informe a sigla do estado com 2 letras.";
  return null;
}

function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function BillingCheckoutPanel({
  clinicId,
  plan,
  sessions,
  onCheckoutReady,
}: {
  clinicId: string;
  plan: BillingPlan;
  sessions: CompanySessionType[];
  onCheckoutReady?: () => void;
}) {
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["company_billing_profile", clinicId],
    queryFn: () => fetchCompanyBillingProfile(clinicId),
    staleTime: 60_000,
    retry: 1,
  });
  const [form, setForm] = useState<CompanyBillingProfileInput>(EMPTY_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [checkout, setCheckout] = useState<AsaasCheckout | null>(null);
  const [openingPayment, setOpeningPayment] = useState(false);
  const selectionKey = useMemo(
    () => `${plan.code}:${[...sessions].sort().join(",")}`,
    [plan.code, sessions],
  );

  useEffect(() => {
    const current = profile.data;
    if (!current) return;
    setForm({
      legalName: current.legal_name ?? "",
      taxId: "",
      billingEmail: current.billing_email ?? "",
      billingPhone: current.billing_phone_digits ?? "",
      postalCode: current.postal_code_digits ?? "",
      addressLine: current.address_line ?? "",
      addressNumber: current.address_number ?? "",
      addressComplement: current.address_complement ?? "",
      district: current.district ?? "",
      city: current.city ?? "",
      state: current.state ?? "",
    });
    setEditingProfile(!current.configured);
  }, [profile.data]);

  useEffect(() => {
    setCheckout(null);
  }, [selectionKey]);

  const update = (field: keyof CompanyBillingProfileInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const validationError = validateProfile(form);
      if (validationError) throw new Error(validationError);
      return upsertCompanyBillingProfile(clinicId, form);
    },
    onSuccess: (saved) => {
      qc.setQueryData(["company_billing_profile", clinicId], saved);
      setForm((current) => ({ ...current, taxId: "" }));
      setEditingProfile(false);
      toast.success("Dados de cobrança salvos com segurança.");
    },
    onError: (error) => {
      toast.error(friendlyBillingError(error, "Não foi possível salvar os dados de cobrança."));
    },
  });

  const prepareCheckout = useMutation({
    mutationFn: async () => {
      if (!profile.data?.configured) {
        throw new Error("Salve os dados de cobrança antes de continuar.");
      }
      const intent = await createCheckoutIntent(plan.code, clinicId, sessions);
      return createAsaasCheckout(intent.checkout_intent_id);
    },
    onSuccess: (result) => {
      setCheckout(result);
      onCheckoutReady?.();
      toast.success("Cobrança preparada no Asaas. O pagamento ainda está pendente.");
    },
    onError: (error) => {
      toast.error(friendlyBillingError(error, "Não foi possível preparar o checkout do Asaas."));
    },
  });

  const openPayment = async () => {
    if (!checkout) return;
    setOpeningPayment(true);
    try {
      await openAsaasCheckoutPayment(checkout);
    } catch (error) {
      toast.error(friendlyBillingError(error, "Não foi possível abrir o pagamento."));
    } finally {
      setOpeningPayment(false);
    }
  };

  const providerBound = Boolean(
    profile.data?.provider_bound_sandbox || profile.data?.provider_bound_production,
  );

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 dark:border-white/[0.07] dark:bg-[#0d1218]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#15988f]/10 text-[#15988f]">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">
              Checkout protegido
            </div>
            <div className="mt-1 text-[15px] font-medium">Assinatura mensal pelo Asaas</div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-emerald-700 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Sem dados de cartão no DentalFlow
        </div>
      </div>

      <p className="mt-5 text-[12px] font-light leading-6 text-slate-500 dark:text-white/42">
        O DentalFlow prepara a assinatura e abre a página segura do Asaas. Criar ou abrir a cobrança
        não libera o sistema: a ativação só acontece depois da confirmação financeira recebida pelo
        backend.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200/75 p-4 dark:border-white/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#15988f]" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                Dados de cobrança da empresa
              </div>
              <div className="mt-1 text-[12px] font-light text-slate-500 dark:text-white/45">
                {profile.isLoading
                  ? "Carregando…"
                  : profile.data?.configured
                    ? `${profile.data.legal_name} · ${profile.data.tax_id_masked}`
                    : "Preenchimento obrigatório antes do pagamento"}
              </div>
            </div>
          </div>
          {profile.data?.configured && !editingProfile && !providerBound ? (
            <button
              type="button"
              onClick={() => setEditingProfile(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[10px] font-medium dark:border-white/[0.09]"
            >
              <Pencil className="h-3.5 w-3.5" /> Atualizar
            </button>
          ) : null}
        </div>

        {providerBound && !editingProfile ? (
          <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-[10px] font-light leading-5 text-slate-500 dark:bg-white/[0.035] dark:text-white/40">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15988f]" />
            Este perfil já está vinculado ao Asaas. Alterações futuras usarão um fluxo de
            atualização auditado para não modificar uma cobrança em andamento.
          </div>
        ) : null}

        {profile.isError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 dark:border-red-400/15 dark:bg-red-400/[0.06] dark:text-red-300">
            Não foi possível carregar os dados de cobrança.{" "}
            <button
              type="button"
              onClick={() => profile.refetch()}
              className="font-semibold underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {editingProfile ? (
          <form
            className="mt-5 border-t border-slate-100 pt-5 dark:border-white/[0.06]"
            onSubmit={(event) => {
              event.preventDefault();
              saveProfile.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <BillingField label="Nome ou razão social" className="sm:col-span-2">
                <input
                  value={form.legalName}
                  onChange={(event) => update("legalName", event.target.value)}
                  autoComplete="organization"
                  maxLength={160}
                  className={INPUT_CLASS}
                  placeholder="Nome completo da empresa"
                />
              </BillingField>
              <BillingField
                label="CPF ou CNPJ"
                hint={
                  profile.data?.configured
                    ? "Digite novamente para confirmar a alteração"
                    : undefined
                }
              >
                <input
                  value={form.taxId}
                  onChange={(event) => update("taxId", event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={18}
                  className={INPUT_CLASS}
                  placeholder="Somente do responsável ou da empresa"
                />
              </BillingField>
              <BillingField label="E-mail de cobrança">
                <input
                  type="email"
                  value={form.billingEmail}
                  onChange={(event) => update("billingEmail", event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  className={INPUT_CLASS}
                  placeholder="financeiro@empresa.com.br"
                />
              </BillingField>
              <BillingField label="Telefone com DDD">
                <input
                  value={form.billingPhone}
                  onChange={(event) => update("billingPhone", event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  className={INPUT_CLASS}
                  placeholder="(92) 99999-9999"
                />
              </BillingField>
              <BillingField label="CEP">
                <input
                  value={form.postalCode}
                  onChange={(event) => update("postalCode", event.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  className={INPUT_CLASS}
                  placeholder="00000-000"
                />
              </BillingField>
              <BillingField label="Endereço" className="sm:col-span-2">
                <input
                  value={form.addressLine}
                  onChange={(event) => update("addressLine", event.target.value)}
                  autoComplete="address-line1"
                  maxLength={180}
                  className={INPUT_CLASS}
                  placeholder="Rua, avenida ou travessa"
                />
              </BillingField>
              <BillingField label="Número">
                <input
                  value={form.addressNumber}
                  onChange={(event) => update("addressNumber", event.target.value)}
                  maxLength={30}
                  className={INPUT_CLASS}
                  placeholder="123"
                />
              </BillingField>
              <BillingField label="Complemento (opcional)">
                <input
                  value={form.addressComplement}
                  onChange={(event) => update("addressComplement", event.target.value)}
                  autoComplete="address-line2"
                  maxLength={120}
                  className={INPUT_CLASS}
                  placeholder="Sala, bloco ou referência"
                />
              </BillingField>
              <BillingField label="Bairro">
                <input
                  value={form.district}
                  onChange={(event) => update("district", event.target.value)}
                  maxLength={100}
                  className={INPUT_CLASS}
                  placeholder="Bairro"
                />
              </BillingField>
              <BillingField label="Cidade">
                <input
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  autoComplete="address-level2"
                  maxLength={100}
                  className={INPUT_CLASS}
                  placeholder="Cidade"
                />
              </BillingField>
              <BillingField label="Estado (UF)">
                <input
                  value={form.state}
                  onChange={(event) => update("state", event.target.value.toUpperCase())}
                  autoComplete="address-level1"
                  maxLength={2}
                  className={`${INPUT_CLASS} uppercase`}
                  placeholder="AM"
                />
              </BillingField>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saveProfile.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#15988f] px-4 text-[11px] font-medium text-white disabled:opacity-50"
              >
                {saveProfile.isPending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {saveProfile.isPending ? "Salvando…" : "Salvar dados de cobrança"}
              </button>
              {profile.data?.configured ? (
                <button
                  type="button"
                  onClick={() => setEditingProfile(false)}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-[10px] font-medium dark:border-white/[0.08]"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
            <p className="mt-4 text-[9px] font-light leading-4 text-slate-400">
              Esses dados são armazenados no perfil fiscal protegido da empresa. O CPF/CNPJ completo
              não volta para a tela depois de salvo.
            </p>
          </form>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50/75 p-4 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Resumo da assinatura
            </div>
            <div className="mt-2 text-[18px] font-light">
              {plan.name} · {formatPlanPrice(plan.monthly_price_cents, plan.currency)}/mês
            </div>
            <div className="mt-2 text-[10px] font-light text-slate-400">
              {sessions.map((session) => COMPANY_SESSION_LABEL[session]).join(" · ")}
            </div>
          </div>
          <MapPin className="h-4 w-4 text-slate-300" />
        </div>
      </div>

      {checkout ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" /> Cobrança criada · pagamento pendente
          </div>
          <div className="mt-3 text-[13px] font-light text-emerald-950 dark:text-emerald-100">
            Vencimento em {formatDueDate(checkout.dueDate)} ·{" "}
            {checkout.environment === "sandbox" ? "Ambiente de testes" : "Produção"}
          </div>
          <button
            type="button"
            disabled={openingPayment}
            onClick={openPayment}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {openingPayment ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {openingPayment ? "Abrindo…" : "Abrir pagamento seguro do Asaas"}
          </button>
          <p className="mt-3 text-[9px] font-light leading-4 text-emerald-800/70 dark:text-emerald-200/60">
            Voltar da página do Asaas não confirma o pagamento. A assinatura permanece bloqueada até
            o backend receber e validar a confirmação financeira.
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={
            profile.isLoading ||
            !profile.data?.configured ||
            editingProfile ||
            prepareCheckout.isPending ||
            sessions.length === 0
          }
          onClick={() => prepareCheckout.mutate()}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#15988f] px-5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {prepareCheckout.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {prepareCheckout.isPending ? "Preparando no Asaas…" : "Continuar para o pagamento"}
        </button>
      )}
    </section>
  );
}

function BillingField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`block text-[10px] font-medium text-slate-500 dark:text-white/50 ${className}`}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        {label}
        {hint ? <span className="text-[8px] font-light text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
