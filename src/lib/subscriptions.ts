import { supabase } from "@/integrations/supabase/client";

export type AccountScope = "professional" | "company";
export type CompanySessionType = "laboratory" | "clinic" | "radiology";
export type SubscriptionStatus =
  | "pending_checkout"
  | "trialing"
  | "active"
  | "past_due"
  | "grace"
  | "suspended"
  | "canceled";
export type SubscriptionAccessMode = "full" | "read_only" | "billing_only" | "needs_company_link";

export type BillingPlan = {
  code: "professional" | "company_initial" | "company_growth" | "company_advanced" | string;
  account_scope: AccountScope;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  currency: string;
  max_sessions: number;
  max_members: number;
  max_company_links: number;
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

export type ProfessionalSubscriptionSnapshot = {
  subscription_id: string;
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  access_mode: SubscriptionAccessMode;
  monthly_price_cents: number;
  max_company_links: number;
  profession_type: string;
};

export type MySubscriptionContext = {
  account_type: "professional" | "company_admin" | "company_member" | "unclassified" | string;
  effective_access: SubscriptionAccessMode;
  active_clinic_id?: string | null;
  company?: CompanySubscriptionSnapshot | null;
  professional?: ProfessionalSubscriptionSnapshot | null;
};

export type CheckoutIntent = {
  checkout_intent_id: string;
  subscription_id: string;
  plan_code: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "provider_created" | "paid" | "expired" | "canceled" | "failed";
};

export const COMPANY_SESSION_LABEL: Record<CompanySessionType, string> = {
  laboratory: "Laboratório",
  clinic: "Clínica",
  radiology: "Radiologia",
};

export async function fetchBillingPlans(scope?: AccountScope): Promise<BillingPlan[]> {
  let query = (supabase as any)
    .from("billing_plans")
    .select("code,account_scope,name,description,monthly_price_cents,currency,max_sessions,max_members,max_company_links,storage_bytes,features,display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (scope) query = query.eq("account_scope", scope);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((plan: any) => ({
    ...plan,
    monthly_price_cents: Number(plan.monthly_price_cents ?? 0),
    max_sessions: Number(plan.max_sessions ?? 0),
    max_members: Number(plan.max_members ?? 0),
    max_company_links: Number(plan.max_company_links ?? 0),
    storage_bytes: Number(plan.storage_bytes ?? 0),
    features: plan.features ?? {},
  })) as BillingPlan[];
}

export async function fetchMySubscriptionContext(): Promise<MySubscriptionContext | null> {
  const { data, error } = await (supabase as any).rpc("my_subscription_context");
  if (error) {
    // 0.3.2 migration may not be present yet while rolling out across environments.
    if (String(error.message ?? "").toLowerCase().includes("my_subscription_context")) return null;
    throw error;
  }
  return (data ?? null) as MySubscriptionContext | null;
}

export async function createCheckoutIntent(planCode: string, clinicId?: string | null): Promise<CheckoutIntent> {
  const { data, error } = await (supabase as any).rpc("create_checkout_intent", {
    p_plan_code: planCode,
    p_clinic_id: clinicId ?? null,
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

export async function switchCompanyContext(clinicId: string): Promise<MySubscriptionContext> {
  const { data, error } = await (supabase as any).rpc("switch_company_context", { p_clinic_id: clinicId });
  if (error) throw error;
  return data as MySubscriptionContext;
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
  const gb = bytes / 1024 ** 3;
  return `${Math.round(gb)} GB`;
}

export function canOperate(context: MySubscriptionContext | null | undefined) {
  return !context || context.effective_access === "full";
}
