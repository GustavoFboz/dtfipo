import { supabase } from "@/integrations/supabase/client";

export type BurrMaterial = "zirconia" | "dissilicato";

export const BURR_CODES = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10"] as const;
export type BurrCode = (typeof BURR_CODES)[number];

export type Holder = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
};

export type Burr = {
  id: string;
  name: string;
  code: string | null;
  holder_id: string | null;
  material: BurrMaterial;
  installed_at: string;
  removed_at: string | null;
  notes: string | null;
};

export type BurrUsage = {
  id: string;
  burr_id: string;
  case_id: string | null;
  material: BurrMaterial;
  teeth_count: number;
  teeth_numbers: number[];
  milled_at: string;
  notes: string | null;
};

export async function fetchHolders(): Promise<Holder[]> {
  const { data, error } = await supabase.from("holders").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Holder[];
}

export async function createHolder(input: { name: string; notes?: string | null }) {
  const { error } = await supabase.from("holders").insert(input);
  if (error) throw error;
}

export async function deleteHolder(id: string) {
  const { error } = await supabase.from("holders").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchBurrs(): Promise<Burr[]> {
  const { data, error } = await supabase
    .from("burrs")
    .select("*")
    .order("installed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Burr[];
}

export async function fetchBurrUsages(burrId?: string): Promise<BurrUsage[]> {
  let q = supabase.from("burr_usages").select("*").order("milled_at", { ascending: false });
  if (burrId) q = q.eq("burr_id", burrId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BurrUsage[];
}

export async function fetchActiveBurr(material: BurrMaterial): Promise<Burr | null> {
  const { data, error } = await supabase
    .from("burrs")
    .select("*")
    .eq("material", material)
    .is("removed_at", null)
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Burr) ?? null;
}

export async function createBurr(input: {
  code: BurrCode;
  holder_id: string;
  material: BurrMaterial;
  notes?: string | null;
}) {
  const { error } = await supabase.from("burrs").insert({
    code: input.code,
    holder_id: input.holder_id,
    material: input.material,
    name: input.code,
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

export async function removeBurr(id: string) {
  const { error } = await supabase
    .from("burrs")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBurr(id: string) {
  const { error } = await supabase.from("burrs").delete().eq("id", id);
  if (error) throw error;
}

export async function recordBurrUsage(input: {
  burr_id: string;
  case_id?: string | null;
  material: BurrMaterial;
  teeth_numbers: number[];
  notes?: string | null;
}) {
  const { error } = await supabase.from("burr_usages").insert({
    burr_id: input.burr_id,
    case_id: input.case_id ?? null,
    material: input.material,
    teeth_count: input.teeth_numbers.length,
    teeth_numbers: input.teeth_numbers,
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

export async function deleteBurrUsage(id: string) {
  const { error } = await supabase.from("burr_usages").delete().eq("id", id);
  if (error) throw error;
}

export async function autoRecordCaseMilling(caseId: string, material: BurrMaterial, teeth: number[]) {
  if (!teeth.length) return;
  const burr = await fetchActiveBurr(material);
  if (!burr) {
    // Não bloquear cadastro do caso quando não houver fresa ativa: registra silenciosamente nada.
    return;
  }
  await recordBurrUsage({ burr_id: burr.id, case_id: caseId, material, teeth_numbers: teeth });
}
