import { supabase } from "@/integrations/supabase/client";

export type StockCategory = {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type StockItemV2 = {
  id: string;
  category_id: string | null;
  category: string | null;
  name: string;
  brand: string | null;
  type: string | null;
  unit: string;
  qty_on_hand: number;
  min_qty: number;
  notes: string | null;
  last_restocked_at: string | null;
  created_at: string;
  updated_at: string;
  implant_system_component_id?: string | null;
  custom_fields?: StockCustomField[];
};

export type StockCustomField = {
  id: string;
  stock_item_id: string;
  key: string;
  value: string | null;
};

function nameToEnum(name: string | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("zirc")) return "zirconia";
  if (n.includes("diss")) return "dissilicato";
  if (n.includes("higien") || n.includes("consum")) return "hygiene";
  return "component";
}

export async function fetchStockCategoriesV2(): Promise<StockCategory[]> {
  const { data, error } = await supabase
    .from("component_categories" as any)
    .select("*")
    .order("position")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as StockCategory[];
}

export async function createStockCategoryV2(name: string, position = 1000) {
  const { data, error } = await supabase
    .from("component_categories" as any)
    .insert({ name, position } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as StockCategory;
}

export async function updateStockCategoryV2(id: string, patch: Partial<StockCategory>) {
  const { error } = await supabase.from("component_categories" as any).update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function deleteStockCategoryV2(id: string) {
  const { error } = await supabase.from("component_categories" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function fetchStockItemsV2(): Promise<StockItemV2[]> {
  const { data, error } = await supabase
    .from("stock_items" as any)
    .select("*, custom_fields:stock_item_custom_fields(*)")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as StockItemV2[];
}

export async function createStockItemV2(input: {
  category_id: string;
  category_name: string;
  name: string;
  brand?: string | null;
  type?: string | null;
  unit?: string;
  qty_on_hand?: number;
  min_qty?: number;
  notes?: string | null;
  custom_fields?: { key: string; value: string }[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("stock_items" as any)
    .insert({
      category_id: input.category_id,
      category: nameToEnum(input.category_name),
      name: input.name,
      brand: input.brand ?? null,
      type: input.type ?? null,
      unit: input.unit ?? "un",
      qty_on_hand: input.qty_on_hand ?? 0,
      min_qty: input.min_qty ?? 0,
      notes: input.notes ?? null,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as any).id as string;
  if (input.custom_fields?.length) {
    const rows = input.custom_fields
      .filter((f) => f.key.trim())
      .map((f) => ({ stock_item_id: id, key: f.key.trim(), value: f.value }));
    if (rows.length) {
      const { error: err2 } = await supabase.from("stock_item_custom_fields" as any).insert(rows as any);
      if (err2) throw err2;
    }
  }
  return id;
}

export async function updateStockItemV2(
  id: string,
  patch: Partial<StockItemV2> & { category_name?: string },
  custom_fields?: { id?: string; key: string; value: string }[],
) {
  const upd: any = { ...patch };
  if (patch.category_name) {
    upd.category = nameToEnum(patch.category_name);
    delete upd.category_name;
  }
  delete upd.custom_fields;
  const { error } = await supabase.from("stock_items" as any).update(upd).eq("id", id);
  if (error) throw error;

  if (custom_fields) {
    await supabase.from("stock_item_custom_fields" as any).delete().eq("stock_item_id", id);
    const rows = custom_fields
      .filter((f) => f.key.trim())
      .map((f) => ({ stock_item_id: id, key: f.key.trim(), value: f.value }));
    if (rows.length) {
      const { error: err2 } = await supabase.from("stock_item_custom_fields" as any).insert(rows as any);
      if (err2) throw err2;
    }
  }
}

export async function deleteStockItemV2(id: string) {
  const { error } = await supabase.from("stock_items" as any).delete().eq("id", id);
  if (error) throw error;
}

/** Liga (ou desliga) um item de estoque a um sistema de implante.
 *  Cria um implant_system_component espelhando o nome do item quando necessário. */
export async function linkStockItemToImplantSystem(
  itemId: string,
  itemName: string,
  systemId: string | null,
  currentComponentId?: string | null,
) {
  if (!systemId) {
    if (currentComponentId) {
      await supabase.from("stock_items" as any).update({ implant_system_component_id: null } as any).eq("id", itemId);
    }
    return;
  }
  // Se já existe componente ligado, apenas garante que pertence ao sistema escolhido.
  if (currentComponentId) {
    const { data: comp } = await supabase
      .from("implant_system_components" as any)
      .select("id, implant_system_id")
      .eq("id", currentComponentId)
      .maybeSingle();
    if ((comp as any)?.implant_system_id === systemId) return;
    if (comp) {
      await supabase
        .from("implant_system_components" as any)
        .update({ implant_system_id: systemId } as any)
        .eq("id", currentComponentId);
      return;
    }
  }
  const { data: created, error } = await supabase
    .from("implant_system_components" as any)
    .insert({ implant_system_id: systemId, name: itemName } as any)
    .select("id")
    .single();
  if (error) throw error;
  const compId = (created as any).id as string;
  const { error: err2 } = await supabase
    .from("stock_items" as any)
    .update({ implant_system_component_id: compId } as any)
    .eq("id", itemId);
  if (err2) throw err2;
}

export async function adjustStockV2(itemId: string, delta: number, notes?: string) {
  if (delta === 0) return;
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("stock_movements" as any).insert({
    stock_item_id: itemId,
    type: delta > 0 ? "in" : "adjust",
    qty: delta,
    qty_before: 0,
    qty_after: 0,
    user_id: userRes.user?.id ?? null,
    notes: notes ?? (delta > 0 ? "Reposição" : "Ajuste"),
  } as any);
  if (error) throw error;
}
