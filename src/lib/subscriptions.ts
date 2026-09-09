import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "@/lib/desktop-local";

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

export type ProfessionalCompanyLink = {
  clinic_id: string;
  clinic_name: string;
  membership_role: string;
  membership_status: string;
  access_source: string;
  is_current: boolean;
  company_plan_code: string | null;
  company_plan_name: string | null;
  company_access_mode: SubscriptionAccessMode | null;
  sessions: CompanySessionType[];
};

export const COMPANY_SESSION_LABEL: Record<CompanySessionType, string> = {
  laboratory: "Laboratório",
  clinic: "Clínica",
  radiology: "Radiologia",
};

const SUBSCRIPTION_CACHE_NAMESPACE = "subscription-context:v1";
const SUBSCRIPTION_CACHE_KEY = "current";

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
    // Desktop may legitimately start without network. A previously verified
    // subscription snapshot is safe for offline continuity; browser failures
    // remain fail-closed in SubscriptionGate.
    if (ownerId && isDentalFlowDesktop()) {
      const cached = await localCacheGet<MySubscriptionContext>(ownerId, SUBSCRIPTION_CACHE_NAMESPACE, SUBSCRIPTION_CACHE_KEY).catch(() => null);
      if (cached?.payload) return cached.payload;
    }
    throw error;
  }
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

export async function fetchMyProfessionalCompanyLinks(): Promise<ProfessionalCompanyLink[]> {
  const { data, error } = await (supabase as any).rpc("my_professional_company_links");
  if (error) throw error;
  return (data ?? []) as ProfessionalCompanyLink[];
}

export async function linkProfessionalCompany(inviteCode: string) {
  const { data, error } = await (supabase as any).rpc("link_professional_company", {
    p_invite_code: inviteCode.trim(),
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível vincular a empresa.");
  return data as { success: true; clinic_id: string; clinic_name: string; already_linked: boolean; context: MySubscriptionContext };
}

export async function unlinkProfessionalCompany(clinicId: string): Promise<MySubscriptionContext> {
  const { data, error } = await (supabase as any).rpc("unlink_professional_company", {
    p_clinic_id: clinicId,
  });
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
  return context?.effective_access === "full";
}
