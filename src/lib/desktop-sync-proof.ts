import { supabase } from "@/integrations/supabase/client";
import { localCacheGet, localCachePut, isDentalFlowDesktop } from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";
import { DESKTOP_READ_TIMEOUT_MS, withDesktopCloudTimeout } from "@/lib/desktop-cloud";

const NS = "desktop-sync-proof:v1";
const KEY = "current";

export type DesktopDatasetCounts = {
  patients: number;
  cases: number;
  caseTypes: number;
  stages: number;
  phases: number;
  doctors: number;
  cadistas: number;
  stockCategories: number;
  stockItems: number;
};

export type DesktopSyncProof = {
  version: 1;
  userId: string;
  verifiedAt: number;
  remote: DesktopDatasetCounts;
  local: DesktopDatasetCounts;
};

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

async function remoteCount(table: string): Promise<number> {
  return withDesktopCloudTimeout(
    `contagem autenticada de ${table}`,
    async () => {
      const result = await (supabase as any).from(table).select("id", { count: "exact", head: true });
      if (result.error) throw result.error;
      return Number(result.count ?? 0);
    },
    DESKTOP_READ_TIMEOUT_MS,
  );
}

async function inspectLocalCounts(ownerId: string): Promise<DesktopDatasetCounts> {
  const [patients, cases, caseTypes, stages, phases, doctors, cadistas, categories, items] = await Promise.all([
    localCacheGet<unknown[]>(ownerId, "patients:v1", "all"),
    localCacheGet<unknown[]>(ownerId, "cases:v1", "all"),
    localCacheGet<unknown[]>(ownerId, "reference-data:v1", "case-types"),
    localCacheGet<unknown[]>(ownerId, "reference-data:v1", "stages"),
    localCacheGet<unknown[]>(ownerId, "reference-data:v1", "phases"),
    localCacheGet<unknown[]>(ownerId, "reference-data:v1", "doctors"),
    localCacheGet<unknown[]>(ownerId, "reference-data:v1", "cadistas"),
    localCacheGet<unknown[]>(ownerId, "stock-v2-categories:v1", "all"),
    localCacheGet<unknown[]>(ownerId, "stock-v2-items:v1", "all"),
  ]);

  return {
    patients: arrayCount(patients?.payload),
    cases: arrayCount(cases?.payload),
    caseTypes: arrayCount(caseTypes?.payload),
    stages: arrayCount(stages?.payload),
    phases: arrayCount(phases?.payload),
    doctors: arrayCount(doctors?.payload),
    cadistas: arrayCount(cadistas?.payload),
    stockCategories: arrayCount(categories?.payload),
    stockItems: arrayCount(items?.payload),
  };
}

function localCoversRemote(local: DesktopDatasetCounts, remote: DesktopDatasetCounts) {
  return (Object.keys(remote) as Array<keyof DesktopDatasetCounts>).every((key) => local[key] >= remote[key]);
}

/**
 * Creates a durable proof only after the current Cloud Login has been validated
 * and the SQLite read models contain at least every row the same authenticated
 * account is allowed to see through RLS. A 200 + [] response from an anonymous
 * request can therefore never mark a machine as fully synchronized.
 */
export async function verifyAndStoreDesktopSyncProof(): Promise<DesktopSyncProof | null> {
  if (!isDentalFlowDesktop() || (typeof navigator !== "undefined" && navigator.onLine === false)) return null;

  const sessionResult = await withDesktopCloudTimeout(
    "sessão para prova de sincronização",
    () => supabase.auth.getSession(),
    DESKTOP_READ_TIMEOUT_MS,
  );
  const session = sessionResult.data.session;
  const user = session?.user;
  if (!user || user.user_metadata?.dentalflow_offline_device) return null;

  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId || ownerId !== user.id) return null;

  const [patients, cases, caseTypes, stages, phases, doctors, cadistas, stockCategories, stockItems] = await Promise.all([
    remoteCount("patients"),
    remoteCount("cases"),
    remoteCount("case_types"),
    remoteCount("stages"),
    remoteCount("phases"),
    remoteCount("doctors"),
    remoteCount("cadistas"),
    remoteCount("component_categories"),
    remoteCount("stock_items"),
  ]);

  const remote: DesktopDatasetCounts = {
    patients,
    cases,
    caseTypes,
    stages,
    phases,
    doctors,
    cadistas,
    stockCategories,
    stockItems,
  };
  const local = await inspectLocalCounts(ownerId);
  if (!localCoversRemote(local, remote)) return null;

  const proof: DesktopSyncProof = {
    version: 1,
    userId: user.id,
    verifiedAt: Date.now(),
    remote,
    local,
  };
  await localCachePut(ownerId, NS, KEY, proof);
  return proof;
}

export async function getDesktopSyncProof(ownerId?: string | null): Promise<DesktopSyncProof | null> {
  if (!isDentalFlowDesktop()) return null;
  const owner = ownerId ?? (await resolveDesktopOwnerId());
  if (!owner) return null;
  const entry = await localCacheGet<DesktopSyncProof>(owner, NS, KEY);
  const proof = entry?.payload ?? null;
  if (!proof || proof.version !== 1 || proof.userId !== owner) return null;
  return proof;
}

export async function inspectDesktopSyncReadiness() {
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return { ownerId: null, proof: null, local: null };
  const [proof, local] = await Promise.all([
    getDesktopSyncProof(ownerId),
    inspectLocalCounts(ownerId),
  ]);
  return { ownerId, proof, local };
}
