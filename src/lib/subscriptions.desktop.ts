// Desktop-only subscription facade.
//
// A fresh Tauri install has no entitlement cache yet. It must verify the real
// authenticated company context before unlocking the Hub. Once that server-verified
// snapshot exists, valid paid access can be read immediately from SQLite while a
// background refresh reconciles billing/session changes.
import { supabase } from "@/integrations/supabase/client";
import {
  isDentalFlowDesktop,
  localCacheGet,
  localCachePut,
} from "./desktop-local";
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
let backgroundRefresh: Promise<MySubscriptionContext | null> | null = null;

function locallySafeContext(context: MySubscriptionContext): MySubscriptionContext {
  if (context.effective_access !== "full") return context;

  const periodEnd = context.company?.current_period_end ?? null;
  const endMs = periodEnd ? Date.parse(periodEnd) : Number.NaN;
  if (Number.isFinite(endMs) && endMs >= Date.now()) return context;

  // Never let a stale/local snapshot extend paid access beyond the last period
  // verified by the server. This is also the fail-closed path for malformed old
  // snapshots that had full access without a current_period_end.
  return {
    ...context,
    effective_access: "billing_only",
    company: context.company
      ? { ...context.company, access_mode: "billing_only" }
      : context.company,
  };
}

async function readCachedContext(ownerId: string | null) {
  if (!ownerId) return null;
  const entry = await localCacheGet<MySubscriptionContext>(
    ownerId,
    SUBSCRIPTION_CACHE_NAMESPACE,
    SUBSCRIPTION_CACHE_KEY,
  ).catch(() => null);
  return entry?.payload ? locallySafeContext(entry.payload) : null;
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
    await persistContext(identity.userId, context);
  }
  return context;
}

function refreshInBackground() {
  if (backgroundRefresh) return backgroundRefresh;
  backgroundRefresh = fetchVerifiedCloudContext()
    .then((context) => {
      if (context && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("dentalflow:subscription-context-updated", { detail: context }),
        );
      }
      return context;
    })
    .catch((error) => {
      console.warn("[DentalFlow Desktop] Atualização da assinatura adiada", error);
      return null;
    })
    .finally(() => {
      backgroundRefresh = null;
    });
  return backgroundRefresh;
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

  // A still-valid paid snapshot can render the Hub immediately. The remote
  // refresh runs concurrently and RLS remains the final authority for writes.
  if (cached?.effective_access === "full") {
    void refreshInBackground();
    return cached;
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
