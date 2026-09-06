import {
  getPendingOutbox,
  isDentalFlowDesktop,
  localCacheGet,
  localCacheList,
  localCachePut,
} from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";

const RECOVERY_NS = "recovery-snapshots:v2";
const RECOVERY_LATEST_KEY = "latest";
const RECOVERY_PREVIOUS_KEY = "previous";

const CRITICAL_LISTS = [
  ["patients:v1", "all"],
  ["cases:v1", "all"],
  ["clinic-appointments:v1", "all"],
  ["clinic-financial:v1", "all"],
  ["clinic-evolutions:v1", "all"],
  ["stock-items:v1", "all"],
  ["stock-movements:v1", "all"],
  ["stock-v2-items:v1", "all"],
  ["stock-v2-categories:v1", "all"],
  ["notifications:v1", "all"],
  ["workflow-stages:v1", "all"],
  ["workflow-assignments:v1", "all"],
  ["workflow-return-reasons:v1", "all"],
] as const;

const ENTITY_MIRRORS = ["patients:v1", "cases:v1"] as const;
const ENTITY_NAMESPACE: Record<string, string> = {
  patients: "patients:v1",
  cases: "cases:v1",
  clinic_appointments: "clinic-appointments:v1",
  clinic_financial_entries: "clinic-financial:v1",
  clinic_patient_evolutions: "clinic-evolutions:v1",
  stock_items: "stock-items:v1",
  notifications: "notifications:v1",
};

type RecoveryItem = {
  namespace: string;
  key: string;
  payload: unknown;
  updatedAt: number;
  itemCount: number | null;
};

export type DesktopRecoverySnapshot = {
  ownerId: string;
  capturedAt: number;
  items: RecoveryItem[];
  intentionalDestructiveNamespaces: string[];
};

export type DesktopRecoveryResult = {
  reconstructedNamespaces: string[];
  protectedNamespaces: string[];
};

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isDestructiveOperation(operation: string) {
  return operation === "delete" || operation === "permanent_delete" || operation === "remove";
}

/**
 * Older desktop builds stored Patients/Cases both as an aggregate `all` list and
 * as individual entity keys. If the aggregate list was accidentally replaced by
 * an empty cloud response, the individual rows can still be present in SQLite.
 * Rebuild the list before any new synchronization happens.
 */
export async function reconstructEntityListsFromLocalRows(): Promise<string[]> {
  if (!isDentalFlowDesktop()) return [];
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  const reconstructed: string[] = [];

  for (const namespace of ENTITY_MIRRORS) {
    const aggregate = await localCacheGet<unknown[]>(ownerId, namespace, "all");
    if (isNonEmptyArray(aggregate?.payload)) continue;

    const entries = await localCacheList<Record<string, unknown>>(ownerId, namespace, 5000);
    const byId = new Map<string, Record<string, unknown>>();
    for (const entry of entries) {
      if (entry.key === "all") continue;
      const payload = entry.payload;
      const id = typeof payload?.id === "string" ? payload.id : null;
      if (!id) continue;
      byId.set(id, payload);
    }

    if (byId.size > 0) {
      await localCachePut(ownerId, namespace, "all", Array.from(byId.values()));
      reconstructed.push(namespace);
    }
  }

  return reconstructed;
}

/** Capture two rotating last-known-good local snapshots before cloud sync. */
export async function captureDesktopRecoverySnapshot(): Promise<DesktopRecoverySnapshot | null> {
  if (!isDentalFlowDesktop()) return null;
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return null;

  const items: RecoveryItem[] = [];
  for (const [namespace, key] of CRITICAL_LISTS) {
    const entry = await localCacheGet<unknown>(ownerId, namespace, key);
    if (entry?.payload == null) continue;
    items.push({
      namespace,
      key,
      payload: entry.payload,
      updatedAt: entry.updated_at,
      itemCount: Array.isArray(entry.payload) ? entry.payload.length : null,
    });
  }

  const pending = await getPendingOutbox(ownerId, 5000).catch(() => []);
  const intentionalDestructiveNamespaces = Array.from(new Set(
    pending
      .filter((entry) => isDestructiveOperation(String(entry.operation)))
      .map((entry) => ENTITY_NAMESPACE[String(entry.entity_type)] ?? "")
      .filter(Boolean),
  ));

  const snapshot: DesktopRecoverySnapshot = {
    ownerId,
    capturedAt: Date.now(),
    items,
    intentionalDestructiveNamespaces,
  };

  const previousLatest = await localCacheGet<DesktopRecoverySnapshot>(ownerId, RECOVERY_NS, RECOVERY_LATEST_KEY);
  if (previousLatest?.payload?.ownerId === ownerId && previousLatest.payload.items?.length) {
    await localCachePut(ownerId, RECOVERY_NS, RECOVERY_PREVIOUS_KEY, previousLatest.payload);
  }
  await localCachePut(ownerId, RECOVERY_NS, RECOVERY_LATEST_KEY, snapshot);
  return snapshot;
}

/**
 * A full list going from N>0 to zero/missing during background sync is treated
 * as a potential destructive regression. Keep the previous local data visible
 * instead of silently replacing real offline data with an empty response. A
 * namespace with an explicit queued delete is excluded so legitimate removal of
 * the final item is never mistaken for data loss.
 */
export async function protectCriticalCachesFromEmptyRegression(
  snapshot: DesktopRecoverySnapshot | null,
): Promise<string[]> {
  if (!snapshot) return [];
  const protectedNamespaces: string[] = [];
  const intentional = new Set(snapshot.intentionalDestructiveNamespaces ?? []);

  for (const item of snapshot.items) {
    if (!isNonEmptyArray(item.payload) || intentional.has(item.namespace)) continue;
    const current = await localCacheGet<unknown>(snapshot.ownerId, item.namespace, item.key);
    const becameEmptyOrMissing = current == null || (Array.isArray(current.payload) && current.payload.length === 0);
    if (becameEmptyOrMissing) {
      await localCachePut(snapshot.ownerId, item.namespace, item.key, item.payload);
      protectedNamespaces.push(item.namespace);
    }
  }

  return protectedNamespaces;
}

export async function getDesktopRecoveryHistory() {
  if (!isDentalFlowDesktop()) return { latest: null, previous: null };
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return { latest: null, previous: null };
  const [latest, previous] = await Promise.all([
    localCacheGet<DesktopRecoverySnapshot>(ownerId, RECOVERY_NS, RECOVERY_LATEST_KEY),
    localCacheGet<DesktopRecoverySnapshot>(ownerId, RECOVERY_NS, RECOVERY_PREVIOUS_KEY),
  ]);
  return { latest: latest?.payload ?? null, previous: previous?.payload ?? null };
}

export async function prepareDesktopRecovery(): Promise<{
  snapshot: DesktopRecoverySnapshot | null;
  reconstructedNamespaces: string[];
}> {
  const reconstructedNamespaces = await reconstructEntityListsFromLocalRows();
  const snapshot = await captureDesktopRecoverySnapshot();
  return { snapshot, reconstructedNamespaces };
}
