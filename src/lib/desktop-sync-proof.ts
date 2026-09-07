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
  version: 2;
  userId: string;
  verifiedAt: number;
  remote: DesktopDatasetCounts;
  local: DesktopDatasetCounts;
  auxiliaryMismatches: Array<keyof DesktopDatasetCounts>;
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

async function remoteCountOptional(table: string): Promise<number> {
  try {
    return await remoteCount(table);
  } catch (error) {
    console.warn(`[DentalFlow Desktop] Diagnóstico auxiliar de ${table} adiado`, error);
    return -1;
  }
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

function criticalReadModelsCoverRemote(local: DesktopDatasetCounts, remote: DesktopDatasetCounts) {
  return local.patients >= remote.patients && local.cases >= remote.cases;
}

function auxiliaryMismatches(local: DesktopDatasetCounts, remote: DesktopDatasetCounts) {
  const keys: Array<keyof DesktopDatasetCounts> = [
    "caseTypes",
    "stages",
    "phases",
    "doctors",
    "cadistas",
    "stockCategories",
    "stockItems",
  ];
  return keys.filter((key) => remote[key] >= 0 && local[key] < remote[key]);
}

/**
 * 0.3.0 readiness proof.
 *
 * The installed client is allowed to enter the application when the authenticated
 * account has a real Cloud session and the two business-critical list mirrors
 * (patients + cases) cover the RLS-visible Cloud rows. Profile and Clinic context
 * are checked separately by DesktopPrimarySyncGate.
 *
 * Reference/stock datasets are still synchronized and diagnosed, but a temporary
 * mismatch in one auxiliary list can no longer lock the entire application behind
 * "Sincronização ainda incompleta". This removes the 0.2.9 deadlock while keeping
 * the protection against anonymous HTTP 200 + [] responses.
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
    remoteCountOptional("case_types"),
    remoteCountOptional("stages"),
    remoteCountOptional("phases"),
    remoteCountOptional("doctors"),
    remoteCountOptional("cadistas"),
    remoteCountOptional("component_categories"),
    remoteCountOptional("stock_items"),
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
  if (!criticalReadModelsCoverRemote(local, remote)) {
    console.warn("[DentalFlow Desktop] Read-model crítico ainda incompleto", {
      remote: { patients: remote.patients, cases: remote.cases },
      local: { patients: local.patients, cases: local.cases },
    });
    return null;
  }

  const mismatches = auxiliaryMismatches(local, remote);
  if (mismatches.length > 0) {
    console.warn("[DentalFlow Desktop] Listas auxiliares continuarão sincronizando em segundo plano", mismatches);
  }

  const proof: DesktopSyncProof = {
    version: 2,
    userId: user.id,
    verifiedAt: Date.now(),
    remote,
    local,
    auxiliaryMismatches: mismatches,
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
  if (!proof || proof.version !== 2 || proof.userId !== owner) return null;
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
