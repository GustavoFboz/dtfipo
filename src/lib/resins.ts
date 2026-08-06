import { supabase } from "@/integrations/supabase/client";

export type ResinPot = {
  id: string;
  stock_item_id: string | null;
  name: string;
  brand: string | null;
  type: string | null;
  color: string | null;
  expires_on: string | null;
  tare_g: number;
  declared_net_g: number;
  current_net_g: number;
  min_net_g: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ResinWeighing = {
  id: string;
  pot_id: string;
  gross_g: number;
  net_g: number;
  source: string;
  notes: string | null;
  created_at: string;
};

export async function fetchResinPots(): Promise<ResinPot[]> {
  const { data, error } = await supabase
    .from("resin_pots" as never)
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as ResinPot[];
}

export async function createResinPot(input: Partial<ResinPot>) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("resin_pots" as never).insert({
    name: input.name,
    brand: input.brand ?? null,
    type: input.type ?? null,
    color: input.color ?? null,
    expires_on: input.expires_on || null,
    tare_g: input.tare_g ?? 0,
    declared_net_g: input.declared_net_g ?? 0,
    current_net_g: input.current_net_g ?? input.declared_net_g ?? 0,
    min_net_g: input.min_net_g ?? 0,
    notes: input.notes ?? null,
    created_by: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function updateResinPot(id: string, patch: Partial<ResinPot>) {
  const { error } = await supabase.from("resin_pots" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteResinPot(id: string) {
  const { error } = await supabase.from("resin_pots" as never).delete().eq("id", id);
  if (error) throw error;
}

/** Registra uma pesagem: o peso líquido é calculado no banco (bruto − tara do pote). */
export async function addResinWeighing(potId: string, grossG: number, source: "manual" | "scale", notes?: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("resin_weighings" as never).insert({
    pot_id: potId,
    gross_g: grossG,
    net_g: 0, // recalculado pelo trigger
    source,
    notes: notes ?? null,
    created_by: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function fetchResinWeighings(potId: string): Promise<ResinWeighing[]> {
  const { data, error } = await supabase
    .from("resin_weighings" as never)
    .select("*")
    .eq("pot_id", potId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as ResinWeighing[];
}

export function fmtKg(grams: number) {
  const kg = (grams ?? 0) / 1000;
  return `${kg.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
}
