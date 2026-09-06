import {
  isDentalFlowDesktop,
  localCacheGet,
  localCacheList,
  localCachePut,
} from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";

const RECOVERY_NS = "recovery-snapshots:v1";
const RECOVERY_KEY = "latest";

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
] as const;

const ENTITY_MIRRORS = ["patients:v1", "cases:v1"] as const;

type RecoveryItem = {
  namespace: string;
  key: string;
  payload: unknown;
  updatedAt: number;
};

export type DesktopRecoverySnapshot = {
  ownerId: string;
  capturedAt: number;
  items: RecoveryItem[];
};

export type DesktopRecoveryResult = {
  reconstructedNamespaces: string[];
  protectedNamespaces: string[];
};

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
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

/** Capture a last-known-good local snapshot immediately before cloud sync. */
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
    });
  }

  const snapshot: DesktopRecoverySnapshot = {
    ownerId,
    capturedAt: Date.now(),
    items,
  };
  await localCachePut(ownerId, RECOVERY_NS, RECOVERY_KEY, snapshot);
  return snapshot;
}

/**
 * A full list going from N>0 to zero during background sync is treated as a
 * potential destructive regression. Keep the previous local data visible and
 * require an explicit reconciliation instead of silently erasing it.
 */
export async function protectCriticalCachesFromEmptyRegression(
  snapshot: DesktopRecoverySnapshot | null,
): Promise<string[]> {
  if (!snapshot) return [];
  const protectedNamespaces: string[] = [];

  for (const item of snapshot.items) {
    if (!isNonEmptyArray(item.payload)) continue;
    const current = await localCacheGet<unknown>(snapshot.ownerId, item.namespace, item.key);
    if (Array.isArray(current?.payload) && current.payload.length === 0) {
      await localCachePut(snapshot.ownerId, item.namespace, item.key, item.payload);
      protectedNamespaces.push(item.namespace);
    }
  }

  return protectedNamespaces;
}

export async function prepareDesktopRecovery(): Promise<{
  snapshot: DesktopRecoverySnapshot | null;
  reconstructedNamespaces: string[];
}> {
  const reconstructedNamespaces = await reconstructEntityListsFromLocalRows();
  const snapshot = await captureDesktopRecoverySnapshot();
  return { snapshot, reconstructedNamespaces };
}
