import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "@/lib/desktop-local";

export type CompanySessionType = "laboratory" | "clinic" | "radiology";
export type SubscriptionStatus =
  | "pending_checkout"
  | "trialing"
  | "active"
  | "past_due"
  | "grace"
  | "suspended"
  | "canceled";
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

export type BillingTestCapability = {
  enabled: boolean;
  until: string | null;
};

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
    company: context.company ? { ...context.company, access_mode: "billing_only" } : context.company,
  };
}

export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await (supabase as any)
    .from("billing_plans")
    .select("code,account_scope,name,description,monthly_price_cents,currency,max_sessions,max_members,storage_bytes,features,display_order")
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
      void localCachePut(ownerId, SUBSCRIPTION_CACHE_NAMESPACE, SUBSCRIPTION_CACHE_KEY, context).catch(() => undefined);
    }
    return context;
  } catch (error) {
    if (ownerId && isDentalFlowDesktop()) {
      const cached = await localCacheGet<MySubscriptionContext>(ownerId, SUBSCRIPTION_CACHE_NAMESPACE, SUBSCRIPTION_CACHE_KEY).catch(() => null);
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
  const { data, error } = await (supabase as any).rpc("create_checkout_intent", {
    p_plan_code: planCode,
    p_clinic_id: clinicId,
    p_session_types: sessions,
  });
  if (error) throw error;
  return data as CheckoutIntent;
}

export async function configureCompanySessions(clinicId: string, sessions: CompanySessionType[]) {
  const { data, error } = await (supabase as any).rpc("configure_company_sessions", {
    p_clinic_id: clinicId,
    p_session_types: sessions,
  });
  if (error) throw error;
  return data as CompanySubscriptionSnapshot;
}

export async function validateCompanyInviteCode(inviteCode: string): Promise<CompanyInviteValidation> {
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
  return data as { success: true; clinic_id: string; clinic_name: string; context: MySubscriptionContext };
}

export async function finalizePendingOnboarding() {
  const { data, error } = await (supabase as any).rpc("finalize_pending_onboarding");
  if (error) throw error;
  if (data?.success === false) throw new Error(data?.error ?? "Não foi possível concluir o cadastro.");
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
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível confirmar o pagamento de teste.");
  return data as { success: true; subscription_id: string; current_period_end: string; context: MySubscriptionContext };
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
