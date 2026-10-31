// Desktop-only subscription facade.
//
// A fresh Tauri install has no entitlement cache yet. It must verify the real
// authenticated company context before unlocking the Hub. Once that server-verified
// snapshot exists, valid paid access can be read from SQLite while offline. When
// connected, the same canonical server context used by Web always wins.
import { supabase } from "@/integrations/supabase/client";
import {
  isDentalFlowDesktop,
  localCacheGet,
  localCachePut,
  getProvisionedDesktopIdentity,
  provisionDesktopIdentity,
  getOfflineAccessRevision,
} from "./desktop-local";
import { hasOfflineAccess } from "./offline-access-policy";
import { restrictOfflineSubscriptionContext } from "./subscription-offline-policy";
import {
  resolveDesktopIdentity,
  resolveDesktopOwnerId,
} from "./desktop-identity";
import {
  DESKTOP_READ_TIMEOUT_MS,
  withDesktopCloudTimeout,
} from "./desktop-cloud";
import type { MySubscriptionContext } from "./subscriptions";

export * from "./subscriptions";

const SUBSCRIPTION_CACHE_NAMESPACE = "subscription-context:v2";
const SUBSCRIPTION_CACHE_KEY = "current";
export const locallySafeContext = restrictOfflineSubscriptionContext;

async function readCachedContext(ownerId: string | null) {
  if (!ownerId) return null;
  // A cached receipt is not an identity grant. The native device must still
  // be authorized within 72 hours, with browser cleanup completed and with
  // the same owner. An expired identity may only be renewed by the server.
  const device = await getProvisionedDesktopIdentity().catch(() => null);
  if (!device || device.user_id !== ownerId || !hasOfflineAccess(device)) return null;
  const entry = await localCacheGet<MySubscriptionContext>(
    ownerId,
    SUBSCRIPTION_CACHE_NAMESPACE,
    SUBSCRIPTION_CACHE_KEY,
  ).catch(() => null);
  if (!entry?.payload || !hasOfflineAccess({
    validated_at: entry.updated_at,
    valid_until: device.valid_until,
  })) return null;
  return locallySafeContext(entry.payload);
}

async function persistContext(ownerId: string, context: MySubscriptionContext) {
  await localCachePut(
    ownerId,
    SUBSCRIPTION_CACHE_NAMESPACE,
    SUBSCRIPTION_CACHE_KEY,
    context,
  );
}

async function fetchVerifiedCloudContext(): Promise<MySubscriptionContext | null> {
  const revision = getOfflineAccessRevision();
  const identity = await resolveDesktopIdentity();
  if (!identity || identity.source !== "cloud") {
    throw new Error("A sessão online ainda não foi validada neste computador.");
  }

  const context = await withDesktopCloudTimeout(
    "assinatura e ambientes da empresa",
    async () => {
      const { data, error } = await (supabase as any).rpc("my_subscription_context");
      if (error) throw error;
      return (data ?? null) as MySubscriptionContext | null;
    },
    DESKTOP_READ_TIMEOUT_MS,
  );

  if (context) {
    // Only an authoritative paid/privileged entitlement renews the 72-hour
    // authorization. A local read, JWT refresh or failed RPC never extends it.
    if (context.effective_access === "full") {
      const previous = await getProvisionedDesktopIdentity();
      const { data } = await supabase.auth.getSession();
      if (revision !== getOfflineAccessRevision() || data.session?.user.id !== identity.userId
        || data.session.user.user_metadata?.dentalflow_offline_device) {
        throw new Error("A autorização offline expirou ou a conta mudou. Entre novamente online.");
      }
      await provisionDesktopIdentity({
        userId: identity.userId,
        email: data.session?.user.email ?? null,
        fullName: previous?.user_id === identity.userId ? previous.full_name : null,
        clinicId: previous?.user_id === identity.userId ? previous.clinic_id : null,
      });
    }
    await persistContext(identity.userId, context);
  }
  return context;
}

/**
 * Warm the authoritative entitlement snapshot during the authenticated Desktop
 * preflight. Fresh installs intentionally have no fallback: the first successful
 * server verification is what creates the offline billing/session authorization.
 */
export async function warmSubscriptionContext(): Promise<MySubscriptionContext | null> {
  if (!isDentalFlowDesktop()) {
    const { data, error } = await (supabase as any).rpc("my_subscription_context");
    if (error) throw error;
    return (data ?? null) as MySubscriptionContext | null;
  }
  return fetchVerifiedCloudContext();
}

export async function fetchMySubscriptionContext(): Promise<MySubscriptionContext | null> {
  if (!isDentalFlowDesktop()) {
    const { data, error } = await (supabase as any).rpc("my_subscription_context");
    if (error) throw error;
    return (data ?? null) as MySubscriptionContext | null;
  }

  const ownerId = await resolveDesktopOwnerId();
  const cached = await readCachedContext(ownerId);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (offline) {
    if (cached) return cached;
    throw new Error(
      "A assinatura desta conta ainda não foi validada neste computador. Conecte-se à internet ao menos uma vez.",
    );
  }

  try {
    const remote = await fetchVerifiedCloudContext();
    return remote ?? cached;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

export async function getCachedSubscriptionContext(): Promise<MySubscriptionContext | null> {
  if (!isDentalFlowDesktop()) return null;
  return readCachedContext(await resolveDesktopOwnerId());
}
