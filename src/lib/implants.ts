// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export type ImplantSystem = {
  id: string;
  name: string;
  line: string | null;
  created_at?: string;
};

export type ImplantSystemComponent = {
  id: string;
  implant_system_id: string;
  name: string;
  sku: string | null;
  notes: string | null;
  component_type_id: string | null;
};

export type ImplantComponentType = {
  id: string;
  name: string;
  position: number;
  active: boolean;
};

export async function fetchImplantComponentTypes(): Promise<ImplantComponentType[]> {
  const { data, error } = await supabase
    .from("implant_component_types" as any)
    .select("id, name, position, active")
    .eq("active", true)
    .order("position")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as ImplantComponentType[];
}

export async function createImplantComponentType(name: string, position = 100) {
  const { error } = await supabase
    .from("implant_component_types" as any)
    .insert({ name: name.trim(), position } as any);
  if (error) throw error;
}

export async function updateImplantComponentType(id: string, patch: Partial<ImplantComponentType>) {
  const { error } = await supabase.from("implant_component_types" as any).update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function deleteImplantComponentType(id: string) {
  const { error } = await supabase.from("implant_component_types" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function addImplantComponent(input: {
  system_id: string;
  type_id: string | null;
  name: string;
  sku?: string;
  qty?: number;
  min_qty?: number;
  unit?: string;
}) {
  const { data, error } = await supabase.rpc("add_implant_component" as any, {
    _system_id: input.system_id,
    _type_id: input.type_id,
    _name: input.name,
    _sku: input.sku ?? null,
    _qty: input.qty ?? 0,
    _min_qty: input.min_qty ?? 0,
    _unit: input.unit ?? "un",
  });
  if (error) throw error;
  const res = data as { success: boolean; error?: string; component_id?: string };
  if (!res.success) throw new Error(res.error ?? "Falha ao criar componente");
  return res.component_id!;
}

export type ImplantStockItem = {
  id: string;
  name: string;
  qty_on_hand: number;
  unit: string;
  implant_system_component_id: string | null;
};

export type CaseImplantTooth = {
  id: string;
  case_id: string;
  tooth_fdi: number;
  implant_system_id: string;
  stock_item_id: string;
  qty: number;
  reversed_at: string | null;
  created_at: string;
};

/** Sugestões de marcas conhecidas — o usuário pode digitar qualquer nome. */
export const IMPLANT_BRAND_SUGGESTIONS = [
  "Sin",
  "Neodent",
  "Oral Fix",
  "Straumann",
  "Nobel Biocare",
  "S.I.N. Implant System",
  "Conexão",
  "Zimmer",
  "DentalCorp",
  "Implacil",
];

export async function fetchImplantSystems(): Promise<ImplantSystem[]> {
  const { data, error } = await supabase
    .from("implant_systems")
    .select("id, name, line, created_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ImplantSystem[];
}

export async function fetchImplantComponents(systemId?: string) {
  let q = supabase
    .from("implant_system_components" as any)
    .select("*")
    .order("name");
  if (systemId) q = q.eq("implant_system_id", systemId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ImplantSystemComponent[];
}

export type ImplantStockItemFull = ImplantStockItem & {
  min_qty: number;
  brand: string | null;
  category_id: string | null;
};

export async function fetchImplantStockItems(): Promise<ImplantStockItemFull[]> {
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, name, qty_on_hand, unit, implant_system_component_id, min_qty, brand, category_id")
    .not("implant_system_component_id", "is", null);
  if (error) throw error;
  return (data ?? []) as unknown as ImplantStockItemFull[];
}

export async function createImplantSystemWithStock(input: {
  name: string;
  line?: string;
  components: { name: string; sku?: string; qty: number; min_qty?: number; unit?: string; component_type_id?: string | null }[];
}) {
  const { data, error } = await supabase.rpc("create_implant_system_with_stock" as any, {
    _name: input.name,
    _line: input.line ?? "",
    _components: input.components as any,
  });
  if (error) throw error;
  const res = data as { success: boolean; error?: string; implant_system_id?: string };
  if (!res.success) throw new Error(res.error ?? "Falha ao criar sistema");
  return res.implant_system_id!;
}

export async function addComponentToSystem(
  systemId: string,
  input: { name: string; sku?: string; qty?: number; min_qty?: number; unit?: string },
) {
  // Cria componente + item de estoque atrelado
  const { data: sys } = await supabase.from("implant_systems").select("name").eq("id", systemId).single();
  const { data: comp, error } = await supabase
    .from("implant_system_components" as any)
    .insert({ implant_system_id: systemId, name: input.name, sku: input.sku ?? null } as any)
    .select("id")
    .single();
  if (error) throw error;

  // Categoria "Implantes"
  const { data: cat } = await supabase
    .from("component_categories" as any)
    .select("id")
    .ilike("name", "Implantes")
    .maybeSingle();
  let catId = (cat as any)?.id as string | undefined;
  if (!catId) {
    const { data: newCat } = await supabase
      .from("component_categories" as any)
      .insert({ name: "Implantes", position: 1000 } as any)
      .select("id")
      .single();
    catId = (newCat as any).id;
  }

  const { error: err2 } = await supabase.from("stock_items" as any).insert({
    category: "component",
    name: input.name,
    brand: (sys as any)?.name ?? null,
    type: (sys as any)?.name ?? null,
    unit: input.unit ?? "un",
    qty_on_hand: input.qty ?? 0,
    min_qty: input.min_qty ?? 0,
    implant_system_component_id: (comp as any).id,
    category_id: catId,
  } as any);
  if (err2) throw err2;
}

export async function deleteImplantSystem(id: string) {
  const { error } = await supabase.from("implant_systems").delete().eq("id", id);
  if (error) throw error;
}

export async function renameImplantSystem(id: string, name: string, line?: string) {
  const { error } = await supabase
    .from("implant_systems")
    .update({ name, line: line ?? null })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchCaseImplantTeeth(caseId: string): Promise<CaseImplantTooth[]> {
  const { data, error } = await supabase
    .from("case_implant_teeth" as any)
    .select("*")
    .eq("case_id", caseId)
    .is("reversed_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as CaseImplantTooth[];
}

export async function registerCaseImplantTooth(caseId: string, tooth: number, stockItemId: string) {
  const { data, error } = await supabase.rpc("register_case_implant_tooth" as any, {
    _case_id: caseId,
    _tooth_fdi: tooth,
    _stock_item_id: stockItemId,
  });
  if (error) throw error;
  const res = data as { success: boolean; error?: string; id?: string };
  if (!res.success) throw new Error(res.error ?? "Falha");
  return res.id;
}

export async function removeCaseImplantTooth(id: string) {
  const { data, error } = await supabase.rpc("remove_case_implant_tooth" as any, { _id: id });
  if (error) throw error;
  const res = data as { success: boolean; error?: string };
  if (!res.success) throw new Error(res.error ?? "Falha");
}
