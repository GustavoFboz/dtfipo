import { supabase } from "@/integrations/supabase/client";
import type { Cadista, CaseType, Component, Doctor, Phase, Profile, Stage, ToothColor } from "./types";
import * as cloud from "./api";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "./desktop-local";

const NS = "reference-data:v1";

type ImplantSystem = Awaited<ReturnType<typeof cloud.fetchImplantSystems>>[number];
type ScanJig = Awaited<ReturnType<typeof cloud.fetchScanJigs>>[number];

type RefKey =
  | "profile"
  | "doctors"
  | "cadistas"
  | "case-types"
  | "tooth-colors"
  | "stages"
  | "phases"
  | "components"
  | "implant-systems"
  | "scan-jigs";

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline"].some((x) => message.includes(x));
}

async function ownerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function cached<T>(key: RefKey, loader: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDentalFlowDesktop()) return loader();
  const id = await ownerId();
  if (!id) return fallback;

  if (online()) {
    try {
      const value = await loader();
      await localCachePut(id, NS, key, value);
      return value;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const entry = await localCacheGet<T>(id, NS, key);
  return entry?.payload ?? fallback;
}

export function fetchProfileLocalFirst(): Promise<Profile | null> {
  return cached("profile", cloud.fetchProfile, null);
}

export function fetchDoctorsLocalFirst(): Promise<Doctor[]> {
  return cached("doctors", cloud.fetchDoctors, []);
}

export function fetchCadistasLocalFirst(): Promise<Cadista[]> {
  return cached("cadistas", cloud.fetchCadistas, []);
}

export function fetchCaseTypesLocalFirst(): Promise<CaseType[]> {
  return cached("case-types", cloud.fetchCaseTypes, []);
}

export function fetchToothColorsLocalFirst(): Promise<ToothColor[]> {
  return cached("tooth-colors", cloud.fetchToothColors, []);
}

export function fetchStagesLocalFirst(): Promise<Stage[]> {
  return cached("stages", cloud.fetchStages, []);
}

export function fetchPhasesLocalFirst(): Promise<Phase[]> {
  return cached("phases", cloud.fetchPhases, []);
}

export function fetchComponentsLocalFirst(): Promise<Component[]> {
  return cached("components", cloud.fetchComponents, []);
}

export function fetchImplantSystemsLocalFirst(): Promise<ImplantSystem[]> {
  return cached("implant-systems", cloud.fetchImplantSystems, []);
}

export async function fetchScanJigsLocalFirst(implantSystemId?: string | null): Promise<ScanJig[]> {
  const rows = await cached<ScanJig[]>("scan-jigs", () => cloud.fetchScanJigs(), []);
  return implantSystemId ? rows.filter((row) => row.implant_system_id === implantSystemId) : rows;
}

export async function warmReferenceLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;

  const results = await Promise.allSettled([
    fetchProfileLocalFirst(),
    fetchDoctorsLocalFirst(),
    fetchCadistasLocalFirst(),
    fetchCaseTypesLocalFirst(),
    fetchToothColorsLocalFirst(),
    fetchStagesLocalFirst(),
    fetchPhasesLocalFirst(),
    fetchComponentsLocalFirst(),
    fetchImplantSystemsLocalFirst(),
    fetchScanJigsLocalFirst(),
  ]);

  return results.filter((result) => result.status === "fulfilled").length;
}
