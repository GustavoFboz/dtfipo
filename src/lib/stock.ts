import { supabase } from "@/integrations/supabase/client";
import type { StockItem, StockMovement, StockCategory, StockMovementType } from "./types";

export async function fetchStockItems(category?: StockCategory): Promise<StockItem[]> {
  let q = supabase.from("stock_items" as never).select("*").order("name");
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as StockItem[];
}

export async function fetchStockMovements(opts?: {
  stock_item_id?: string;
  case_id?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  let q = supabase
    .from("stock_movements" as never)
    .select("*, item:stock_items(*)")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.stock_item_id) q = q.eq("stock_item_id", opts.stock_item_id);
  if (opts?.case_id) q = q.eq("case_id", opts.case_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export async function createStockItem(input: {
  category: StockCategory;
  name: string;
  brand?: string | null;
  color?: string | null;
  block_type?: string | null;
  unit?: string;
  qty_on_hand?: number;
  min_qty?: number;
  component_id?: string | null;
  notes?: string | null;
}) {
  const { error } = await supabase.from("stock_items" as never).insert({
    category: input.category,
    name: input.name,
    brand: input.brand ?? null,
    color: input.color ?? null,
    block_type: input.block_type ?? null,
    unit: input.unit ?? "un",
    qty_on_hand: input.qty_on_hand ?? 0,
    min_qty: input.min_qty ?? 0,
    component_id: input.component_id ?? null,
    notes: input.notes ?? null,
  } as never);
  if (error) throw error;
}

export async function updateStockItem(id: string, patch: Partial<StockItem>) {
  const { error } = await supabase.from("stock_items" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteStockItem(id: string) {
  const { error } = await supabase.from("stock_items" as never).delete().eq("id", id);
  if (error) throw error;
}

async function insertMovement(payload: {
  stock_item_id: string;
  type: StockMovementType;
  qty: number;
  notes?: string | null;
  case_id?: string | null;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("stock_movements" as never).insert({
    stock_item_id: payload.stock_item_id,
    type: payload.type,
    qty: payload.qty,
    qty_before: 0, // overwritten by trigger
    qty_after: 0,
    case_id: payload.case_id ?? null,
    user_id: userRes.user?.id ?? null,
    notes: payload.notes ?? null,
  } as never);
  if (error) throw error;
}

export async function restockItem(itemId: string, qty: number, notes?: string) {
  if (qty <= 0) throw new Error("Quantidade deve ser positiva");
  await insertMovement({ stock_item_id: itemId, type: "in", qty, notes });
}

export async function consumeItem(itemId: string, qty: number, notes?: string) {
  if (qty <= 0) throw new Error("Quantidade deve ser positiva");
  await insertMovement({ stock_item_id: itemId, type: "out", qty: -qty, notes });
}

export async function adjustItem(itemId: string, newQty: number, currentQty: number, notes?: string) {
  const delta = newQty - currentQty;
  if (delta === 0) return;
  await insertMovement({
    stock_item_id: itemId,
    type: "adjust",
    qty: delta,
    notes: notes ?? `Ajuste de inventário (${currentQty} → ${newQty})`,
  });
}

export async function consumeCaseStock(caseId: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("consume_case_stock" as never, {
    _case_id: caseId,
    _user: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function reverseCaseStock(caseId: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("reverse_case_stock" as never, {
    _case_id: caseId,
    _user: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export const CATEGORY_LABEL: Record<StockCategory, string> = {
  zirconia: "Zircônia",
  dissilicato: "Dissilicato",
  component: "Componentes",
  hygiene: "Higiene & Consumíveis",
};

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  in: "Reposição",
  out: "Saída manual",
  auto_case: "Consumo (caso)",
  reverse_case: "Reabertura (caso)",
  adjust: "Ajuste",
};
