import { Capacitor } from "@capacitor/core";

import { supabase } from "@/integrations/supabase/client";
import {
  isDentalFlowDesktop,
  isDentalFlowWindowsDesktop,
  localCacheGet,
  localCachePut,
  openDesktopExternalUrl,
} from "@/lib/desktop-local";

export type CompanySessionType = "laboratory" | "clinic" | "radiology";
export type SubscriptionStatus =
  "pending_checkout" | "trialing" | "active" | "past_due" | "grace" | "suspended" | "canceled";
export type SubscriptionAccessMode = "full" | "billing_only" | "needs_company_link";

export type BillingPlan = {
  code: "company_initial" | "company_growth" | "company_advanced" | string;
  account_scope: "company";
  name: string;
  description: string | null;
  monthly_price_cents: number;
  currency: string;
  max_sessions: number;
  max_members: number;
  storage_bytes: number;
  features: Record<string, boolean | string | number | null>;
  display_order: number;
};

export type CompanySubscriptionSnapshot = {
  subscription_id: string;
  scope: "company";
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  access_mode: SubscriptionAccessMode;
  billing_day: number | null;
  current_period_end: string | null;
  grace_until: string | null;
  monthly_price_cents: number;
  currency: string;
  max_sessions: number;
  max_members: number;
  storage_bytes: number;
  features: Record<string, boolean | string | number | null>;
  sessions: CompanySessionType[];
};

export type MySubscriptionContext = {
  account_type: "professional" | "company_admin" | "company_member" | "unclassified" | string;
  effective_access: SubscriptionAccessMode;
  active_clinic_id?: string | null;
  company?: CompanySubscriptionSnapshot | null;
  professional_profile?: { profession_type: string | null } | null;
};

export type CheckoutIntent = {
  checkout_intent_id: string;
  subscription_id: string;
  plan_code: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "provider_created" | "paid" | "expired" | "canceled" | "failed";
  billing_mode?: "sandbox" | "live";
};

export type CompanyBillingProfile = {
  configured: boolean;
  clinic_id: string;
  legal_name?: string;
  tax_id_type?: "CPF" | "CNPJ";
  tax_id_masked?: string;
  billing_email?: string;
  billing_phone_digits?: string;
  postal_code_digits?: string;
  address_line?: string;
  address_number?: string;
  address_complement?: string | null;
  district?: string;
  city?: string;
  state?: string;
  country_code?: "BR";
  provider_bound_sandbox?: boolean;
  provider_bound_production?: boolean;
  updated_at?: string;
};

export type CompanyBillingProfileInput = {
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingPhone: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  state: string;
};

export type AsaasCheckout = {
  checkoutIntentId: string;
  subscriptionId: string;
  paymentId: string;
  paymentUrl: string;
  dueDate: string;
  amountCents: number;
  currency: "BRL";
  environment: "sandbox" | "production";
  customerReused: boolean;
  subscriptionReused: boolean;
  paymentConfirmed: false;
};

export type BillingTestCapability = {
  enabled: boolean;
  until: string | null;
};

type AsaasCheckoutTransportResult =
  | { ok: true; checkout: AsaasCheckout }
  | { ok: false; error: string; code: string; status: number };

class BillingCheckoutClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(error: string, code: string, status: number) {
    super(error);
    this.name = "BillingCheckoutClientError";
    this.code = code;
    this.status = status;
  }
}

export type CompanyInviteValidation = {
  valid: boolean;
  reason?: "invalid_code" | "company_inactive" | "seat_limit" | string;
  clinic_name?: string;
  plan_name?: string;
  members_used?: number;
  members_limit?: number;
};

export type CompanyTeamInviteInfo = {
  clinic_id: string;
  clinic_name: string;
  invite_code: string;
  plan_code: string | null;
  plan_name: string | null;
  members_used: number;
  members_limit: number;
  access_mode: SubscriptionAccessMode;
};

export const COMPANY_SESSION_LABEL: Record<CompanySessionType, string> = {
  laboratory: "Laboratório",
  clinic: "Clínica",
  radiology: "Radiologia",
};

const SUBSCRIPTION_CACHE_NAMESPACE = "subscription-context:v2";
const SUBSCRIPTION_CACHE_KEY = "current";

function normalizeOfflineContext(context: MySubscriptionContext): MySubscriptionContext {
  const end = context.company?.current_period_end;
  if (context.effective_access !== "full" || !end) return context;
  const endMs = Date.parse(end);
  if (!Number.isFinite(endMs) || endMs >= Date.now()) return context;
  return {
    ...context,
    effective_access: "billing_only",
    company: context.company
      ? { ...context.company, access_mode: "billing_only" }
      : context.company,
  };
}

export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await (supabase as any)
    .from("billing_plans")
    .select(
      "code,account_scope,name,description,monthly_price_cents,currency,max_sessions,max_members,storage_bytes,features,display_order",
    )
    .eq("is_active", true)
    .eq("account_scope", "company")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((plan: any) => ({
    ...plan,
    monthly_price_cents: Number(plan.monthly_price_cents ?? 0),
    max_sessions: Number(plan.max_sessions ?? 0),
    max_members: Number(plan.max_members ?? 0),
    storage_bytes: Number(plan.storage_bytes ?? 0),
    features: plan.features ?? {},
  })) as BillingPlan[];
}

export async function fetchMySubscriptionContext(): Promise<MySubscriptionContext | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user?.id ?? null;

  try {
    const { data, error } = await (supabase as any).rpc("my_subscription_context");
    if (error) throw error;
    const context = (data ?? null) as MySubscriptionContext | null;
    if (context && ownerId && isDentalFlowDesktop()) {
      void localCachePut(
        ownerId,
        SUBSCRIPTION_CACHE_NAMESPACE,
        SUBSCRIPTION_CACHE_KEY,
        context,
      ).catch(() => undefined);
    }
    return context;
  } catch (error) {
    if (ownerId && isDentalFlowDesktop()) {
      const cached = await localCacheGet<MySubscriptionContext>(
        ownerId,
        SUBSCRIPTION_CACHE_NAMESPACE,
        SUBSCRIPTION_CACHE_KEY,
      ).catch(() => null);
      if (cached?.payload) return normalizeOfflineContext(cached.payload);
    }
    throw error;
  }
}

export async function createCheckoutIntent(
  planCode: string,
  clinicId: string,
  sessions: CompanySessionType[] = [],
): Promise<CheckoutIntent> {
  const { data, error } = await supabase.rpc("create_checkout_intent", {
    p_plan_code: planCode,
    p_clinic_id: clinicId,
    p_session_types: sessions,
  });
  if (error) throw error;
  return data as CheckoutIntent;
}

export async function fetchCompanyBillingProfile(clinicId: string): Promise<CompanyBillingProfile> {
  const { data, error } = await supabase.rpc("billing_get_company_profile", {
    p_clinic_id: clinicId,
  });
  if (error) throw error;
  return (data ?? { configured: false, clinic_id: clinicId }) as CompanyBillingProfile;
}

export async function upsertCompanyBillingProfile(
  clinicId: string,
  input: CompanyBillingProfileInput,
): Promise<CompanyBillingProfile> {
  const { data, error } = await supabase.rpc("billing_upsert_company_profile", {
    p_clinic_id: clinicId,
    p_legal_name: input.legalName.trim(),
    p_tax_id: input.taxId.trim(),
    p_billing_email: input.billingEmail.trim(),
    p_billing_phone: input.billingPhone.trim(),
    p_postal_code: input.postalCode.trim(),
    p_address_line: input.addressLine.trim(),
    p_address_number: input.addressNumber.trim(),
    p_address_complement: input.addressComplement.trim(),
    p_district: input.district.trim(),
    p_city: input.city.trim(),
    p_state: input.state.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as CompanyBillingProfile;
}

function checkoutApiUrl(): string {
  const canonical = "https://dtfipo.lovable.app/api/billing/asaas-checkout";
  if (typeof window === "undefined" || isDentalFlowDesktop()) return canonical;
  try {
    const current = new URL(window.location.href);
    if (current.protocol === "http:" || current.protocol === "https:") {
      return new URL("/api/billing/asaas-checkout", current.origin).toString();
    }
  } catch {
    // Native and malformed origins always fall back to the canonical backend.
  }
  return canonical;
}

function validateAsaasPaymentUrl(value: unknown, environment: "sandbox" | "production"): string {
  let url: URL;
  try {
    url = new URL(String(value ?? ""));
  } catch {
    throw new Error("O checkout retornou um endereço de pagamento inválido.");
  }
  const expectedHost = environment === "sandbox" ? "sandbox.asaas.com" : "www.asaas.com";
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    !/^\/i\/[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(`${url.pathname}${url.search}${url.hash}`)
  ) {
    throw new Error("O checkout retornou um endereço fora do ambiente Asaas permitido.");
  }
  return url.toString();
}

function parseAsaasCheckout(value: unknown): AsaasCheckout {
  if (!value || typeof value !== "object") {
    throw new Error("O backend retornou um checkout inválido.");
  }
  const result = value as Partial<AsaasCheckout>;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result.checkoutIntentId ?? "",
    ) ||
    !/^sub_[A-Za-z0-9]+$/.test(result.subscriptionId ?? "") ||
    !/^pay_[A-Za-z0-9]+$/.test(result.paymentId ?? "") ||
    !Number.isSafeInteger(result.amountCents) ||
    Number(result.amountCents) <= 0 ||
    result.currency !== "BRL" ||
    !["sandbox", "production"].includes(result.environment ?? "") ||
    result.paymentConfirmed !== false
  ) {
    throw new Error("O backend retornou um checkout incompleto.");
  }
  const environment = result.environment as "sandbox" | "production";
  return {
    ...(result as AsaasCheckout),
    paymentUrl: validateAsaasPaymentUrl(result.paymentUrl, environment),
  };
}

export async function createAsaasCheckout(checkoutIntentId: string): Promise<AsaasCheckout> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente para continuar.");

  // Lovable's authenticated preview proxies the application through its own
  // runtime. Server functions are the platform-native transport there and do
  // not depend on a file-route request surviving that proxy. Installed shells
  // keep using the stable public HTTPS endpoint below.
  if (!isDentalFlowDesktop() && !Capacitor.isNativePlatform()) {
    const { createAsaasCheckoutServerFn } = await import("@/lib/billing/asaas-checkout.functions");
    const result = (await createAsaasCheckoutServerFn({
      data: { checkoutIntentId },
    })) as AsaasCheckoutTransportResult;
    if (!result.ok) {
      throw new BillingCheckoutClientError(result.error, result.code, result.status);
    }
    return parseAsaasCheckout(result.checkout);
  }

  const response = await fetch(checkoutApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ checkoutIntentId }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
  } | null;
  if (!response.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Não foi possível preparar o pagamento.";
    const code =
      typeof payload?.code === "string" ? payload.code : "ASAAS_CHECKOUT_TRANSPORT_FAILED";
    throw new BillingCheckoutClientError(message, code, response.status);
  }
  return parseAsaasCheckout(payload);
}

export async function openAsaasCheckoutPayment(checkout: AsaasCheckout): Promise<void> {
  const url = validateAsaasPaymentUrl(checkout.paymentUrl, checkout.environment);

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  if (isDentalFlowWindowsDesktop()) {
    await openDesktopExternalUrl(url);
    return;
  }
  if (typeof window === "undefined") throw new Error("O navegador não está disponível.");
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

export function friendlyBillingError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const explicitCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const code = explicitCode || /\b(BILLING_[A-Z0-9_]+)\b/.exec(raw)?.[1];
  const messages: Record<string, string> = {
    BILLING_PROFILE_INVALID_TAX_ID: "Informe um CPF ou CNPJ válido.",
    BILLING_PROFILE_INVALID_LEGAL_NAME: "Informe o nome ou a razão social.",
    BILLING_PROFILE_INVALID_EMAIL: "Informe um e-mail de cobrança válido.",
    BILLING_PROFILE_INVALID_PHONE: "Informe um telefone com DDD.",
    BILLING_PROFILE_INVALID_POSTAL_CODE: "Informe um CEP com 8 números.",
    BILLING_PROFILE_INVALID_STATE: "Informe a sigla do estado com 2 letras.",
    BILLING_PROFILE_FORBIDDEN: "Somente o administrador pode alterar os dados de cobrança.",
    BILLING_PROVIDER_CHECKOUT_LOCKED:
      "Já existe uma cobrança Asaas para esta assinatura. Conclua a cobrança atual antes de alterar a seleção.",
    BILLING_PROVIDER_SUBSCRIPTION_PLAN_LOCKED:
      "Este plano já possui uma assinatura Asaas vinculada e não pode ser trocado neste checkout.",
  };
  if (code && messages[code]) return messages[code];
  return raw && !raw.toLowerCase().includes("failed to fetch") ? raw : fallback;
}

export async function configureCompanySessions(clinicId: string, sessions: CompanySessionType[]) {
  const { data, error } = await (supabase as any).rpc("configure_company_sessions", {
    p_clinic_id: clinicId,
    p_session_types: sessions,
  });
  if (error) throw error;
  return data as CompanySubscriptionSnapshot;
}

export async function validateCompanyInviteCode(
  inviteCode: string,
): Promise<CompanyInviteValidation> {
  const { data, error } = await (supabase as any).rpc("validate_company_invite_code", {
    p_invite_code: inviteCode.trim(),
  });
  if (error) throw error;
  return (data ?? { valid: false, reason: "invalid_code" }) as CompanyInviteValidation;
}

export async function fetchCompanyTeamInviteInfo(): Promise<CompanyTeamInviteInfo> {
  const { data, error } = await (supabase as any).rpc("company_team_invite_info");
  if (error) throw error;
  return data as CompanyTeamInviteInfo;
}

export async function linkProfessionalCompany(inviteCode: string) {
  const { data, error } = await (supabase as any).rpc("link_professional_company", {
    p_invite_code: inviteCode.trim(),
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível vincular a empresa.");
  return data as {
    success: true;
    clinic_id: string;
    clinic_name: string;
    context: MySubscriptionContext;
  };
}

export async function finalizePendingOnboarding() {
  const { data, error } = await (supabase as any).rpc("finalize_pending_onboarding");
  if (error) throw error;
  if (data?.success === false)
    throw new Error(data?.error ?? "Não foi possível concluir o cadastro.");
  return data as { success: true; already_finalized?: boolean; nothing_pending?: boolean };
}

export async function fetchBillingTestCapability(): Promise<BillingTestCapability> {
  const { data, error } = await (supabase as any).rpc("billing_test_capability");
  if (error) return { enabled: false, until: null };
  return (data ?? { enabled: false, until: null }) as BillingTestCapability;
}

export async function redeemBillingTestToken(token: string): Promise<BillingTestCapability> {
  const { data, error } = await (supabase as any).rpc("billing_test_redeem_token", {
    p_token: token.trim(),
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível ativar o modo de teste.");
  return { enabled: Boolean(data.enabled), until: data.until ?? null };
}

export async function confirmSandboxPayment(checkoutIntentId: string) {
  const { data, error } = await (supabase as any).rpc("billing_test_mark_checkout_paid", {
    p_checkout_intent_id: checkoutIntentId,
  });
  if (error) throw error;
  if (!data?.success)
    throw new Error(data?.error ?? "Não foi possível confirmar o pagamento de teste.");
  return data as {
    success: true;
    subscription_id: string;
    current_period_end: string;
    context: MySubscriptionContext;
  };
}

export async function simulateSandboxNonpayment(clinicId: string) {
  const { data, error } = await (supabase as any).rpc("billing_test_simulate_nonpayment", {
    p_clinic_id: clinicId,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível simular o vencimento.");
  return data as { success: true; context: MySubscriptionContext };
}

export function formatPlanPrice(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatStorage(bytes: number) {
  if (!bytes) return "—";
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

export function canOperate(context: MySubscriptionContext | null | undefined) {
  return context?.effective_access === "full";
}
