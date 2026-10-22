import { supabase } from "@/integrations/supabase/client";
import type { StockCategory, StockItem, StockMovement, StockMovementType } from "./types";
import * as cloud from "./stock";
import {
  clearDoneOutbox,
  getPendingOutbox,
  isDentalFlowDesktop,
  markOutbox,
  type OutboxEntry,
} from "./desktop-local";

import {stockCompanyScope, companyStockCacheGet, companyStockCachePut, enqueueCompanyStock, companyStockPayload, StockCompanyScopeError, type StockCompanyScope} from './stock-company-local';

const ITEMS_NS = "stock-items:v1";
const MOVEMENTS_NS = "stock-movements:v1";
const ALL_KEY = "all";
const ITEM_ENTITY = "stock_items";
const MOVEMENT_ENTITY = "stock_movements";

export type StockOfflineSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  itemsCached: number;
  movementsCached: number;
};

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline"].some((x) => message.includes(x));
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  throw new Error("Este dispositivo não oferece geração segura de identificadores locais.");
}

async function requireOwnerId() { return stockCompanyScope(); }

async function readItems(owner: StockCompanyScope): Promise<StockItem[]> {
  const entry = await companyStockCacheGet<StockItem[]>(owner, ITEMS_NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeItems(owner: StockCompanyScope, rows: StockItem[]) {
  await companyStockCachePut(owner, ITEMS_NS, ALL_KEY, [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR")));
}

async function readMovements(owner: StockCompanyScope): Promise<StockMovement[]> {
  const entry = await companyStockCacheGet<StockMovement[]>(owner, MOVEMENTS_NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeMovements(owner: StockCompanyScope, rows: StockMovement[]) {
  await companyStockCachePut(owner, MOVEMENTS_NS, ALL_KEY, [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
}

async function upsertItem(owner: StockCompanyScope, row: StockItem) {
  const current = await readItems(owner);
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [...current, row];
  await writeItems(owner, next);
}

async function removeItem(owner: StockCompanyScope, id: string) {
  await writeItems(owner, (await readItems(owner)).filter((item) => item.id !== id));
}

function buildItem(id: string, input: Record<string, any>, existing?: StockItem | null): StockItem {
  const now = new Date().toISOString();
  return {
    ...(existing ?? {}),
    ...input,
    id,
    category: input.category ?? existing?.category ?? "component",
    name: String(input.name ?? existing?.name ?? "Item"),
    brand: input.brand ?? existing?.brand ?? null,
    color: input.color ?? existing?.color ?? null,
    block_type: input.block_type ?? existing?.block_type ?? null,
    unit: input.unit ?? existing?.unit ?? "un",
    qty_on_hand: Number(input.qty_on_hand ?? existing?.qty_on_hand ?? 0),
    min_qty: Number(input.min_qty ?? existing?.min_qty ?? 0),
    component_id: input.component_id ?? existing?.component_id ?? null,
    notes: input.notes ?? existing?.notes ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    requires_sintering: input.requires_sintering ?? existing?.requires_sintering ?? false,
  } as StockItem;
}

export async function fetchStockItemsLocalFirst(category?: StockCategory): Promise<StockItem[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchStockItems(category);
  const owner = await requireOwnerId();
  if (online()) {
    try {
      const rows = await cloud.fetchStockItems();
      await writeItems(owner, rows);
      return category ? rows.filter((row) => row.category === category) : rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  const cached = await readItems(owner);
  return category ? cached.filter((row) => row.category === category) : cached;
}

export async function fetchStockMovementsLocalFirst(opts?: { stock_item_id?: string; case_id?: string; limit?: number }): Promise<StockMovement[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchStockMovements(opts);
  const owner = await requireOwnerId();
  if (online()) {
    try {
      const rows = await cloud.fetchStockMovements({ limit: Math.max(opts?.limit ?? 200, 1000) });
      await writeMovements(owner, rows);
      return filterMovements(rows, opts);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return filterMovements(await readMovements(owner), opts);
}

function filterMovements(rows: StockMovement[], opts?: { stock_item_id?: string; case_id?: string; limit?: number }) {
  let result = rows;
  if (opts?.stock_item_id) result = result.filter((row) => row.stock_item_id === opts.stock_item_id);
  if (opts?.case_id) result = result.filter((row) => row.case_id === opts.case_id);
  return result.slice(0, opts?.limit ?? 200);
}

export async function createStockItemLocalFirst(input: Parameters<typeof cloud.createStockItem>[0]) {
  if (!isDentalFlowDesktop()) return cloud.createStockItem(input);
  const owner = await requireOwnerId();
  const id = uuid();
  const local = buildItem(id, input as any);

  const queue = async () => {
    await upsertItem(owner, local);
    await enqueueCompanyStock({ scope: owner, entityType: ITEM_ENTITY, entityId: id, operation: "create", payload: { id, ...input } });
  };

  if (!online()) return queue();
  try {
    await cloud.createStockItem(input);
    await warmStockLocalCache();
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function updateStockItemLocalFirst(id: string, patch: Partial<StockItem>) {
  if (!isDentalFlowDesktop()) return cloud.updateStockItem(id, patch);
  const owner = await requireOwnerId();
  const existing = (await readItems(owner)).find((item) => item.id === id) ?? null;
  const local = buildItem(id, patch as any, existing);

  const queue = async () => {
    await upsertItem(owner, local);
    await enqueueCompanyStock({ scope: owner, entityType: ITEM_ENTITY, entityId: id, operation: "update", payload: patch });
  };

  if (!online()) return queue();
  try {
    await cloud.updateStockItem(id, patch);
    await upsertItem(owner, local);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function deleteStockItemLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.deleteStockItem(id);
  const owner = await requireOwnerId();

  const queue = async () => {
    await removeItem(owner, id);
    await enqueueCompanyStock({ scope: owner, entityType: ITEM_ENTITY, entityId: id, operation: "delete", payload: { id } });
  };

  if (!online()) return queue();
  try {
    await cloud.deleteStockItem(id);
    await removeItem(owner, id);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

async function queueMovement(itemId: string, type: StockMovementType, qty: number, notes?: string, caseId?: string | null) {
  const owner = await requireOwnerId();
  const items = await readItems(owner);
  const item = items.find((row) => row.id === itemId);
  if (!item) throw new Error("Item de estoque ainda não está disponível localmente.");
  const before = Number(item.qty_on_hand ?? 0);
  const after = before + qty;
  if (after < 0) throw new Error("Estoque local insuficiente para esta operação.");

  const movement: StockMovement = {
    id: uuid(),
    stock_item_id: itemId,
    type,
    qty,
    qty_before: before,
    qty_after: after,
    case_id: caseId ?? null,
    user_id: owner.ownerId,
    notes: notes ?? null,
    created_at: new Date().toISOString(),
    item: { ...item, qty_on_hand: after },
  };

  await Promise.all([
    upsertItem(owner, { ...item, qty_on_hand: after, updated_at: new Date().toISOString() }),
    writeMovements(owner, [movement, ...(await readMovements(owner))]),
    enqueueCompanyStock({ scope: owner, entityType: MOVEMENT_ENTITY, entityId: movement.id, operation: "create", payload: movement }),
  ]);
}

export async function restockItemLocalFirst(itemId: string, qty: number, notes?: string) {
  if (qty <= 0) throw new Error("Quantidade deve ser positiva");
  if (!isDentalFlowDesktop()) return cloud.restockItem(itemId, qty, notes);
  if (!online()) return queueMovement(itemId, "in", qty, notes);
  try {
    await cloud.restockItem(itemId, qty, notes);
    await warmStockLocalCache();
  } catch (error) {
    if (transient(error)) return queueMovement(itemId, "in", qty, notes);
    throw error;
  }
}

export async function consumeItemLocalFirst(itemId: string, qty: number, notes?: string) {
  if (qty <= 0) throw new Error("Quantidade deve ser positiva");
  if (!isDentalFlowDesktop()) return cloud.consumeItem(itemId, qty, notes);
  if (!online()) return queueMovement(itemId, "out", -qty, notes);
  try {
    await cloud.consumeItem(itemId, qty, notes);
    await warmStockLocalCache();
  } catch (error) {
    if (transient(error)) return queueMovement(itemId, "out", -qty, notes);
    throw error;
  }
}

export async function adjustItemLocalFirst(itemId: string, newQty: number, currentQty: number, notes?: string) {
  const delta = newQty - currentQty;
  if (delta === 0) return;
  if (!isDentalFlowDesktop()) return cloud.adjustItem(itemId, newQty, currentQty, notes);
  if (!online()) return queueMovement(itemId, "adjust", delta, notes ?? `Ajuste de inventário (${currentQty} → ${newQty})`);
  try {
    await cloud.adjustItem(itemId, newQty, currentQty, notes);
    await warmStockLocalCache();
  } catch (error) {
    if (transient(error)) return queueMovement(itemId, "adjust", delta, notes ?? `Ajuste de inventário (${currentQty} → ${newQty})`);
    throw error;
  }
}

async function syncEntry(owner: StockCompanyScope, entry: OutboxEntry<Record<string, any>>) {
  await markOutbox(owner.ownerId, entry.id, "syncing");
  try {
    entry = {...entry, payload: await companyStockPayload(owner,entry.payload)};
    if (entry.entity_type === ITEM_ENTITY) {
      const id = entry.entity_id ?? entry.payload.id;
      if (!id) throw new Error("Item local sem identificador.");
      if (entry.operation === "create") {
        const { data, error } = await (supabase as any).from(ITEM_ENTITY).upsert({ ...entry.payload, id, clinic_id: owner.clinicId }, { onConflict: "id" }).select().single();
        if (error) throw error;
        await upsertItem(owner, data as StockItem);
      } else if (entry.operation === "update") {
        const { data, error } = await (supabase as any).from(ITEM_ENTITY).update({...entry.payload,clinic_id:owner.clinicId}).eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) {
          await markOutbox(owner.ownerId, entry.id, "conflict", "O item de estoque não existe mais no servidor.");
          return "conflict" as const;
        }
        await upsertItem(owner, data as StockItem);
      } else if (entry.operation === "delete") {
        const { error } = await (supabase as any).from(ITEM_ENTITY).delete().eq("id", id);
        if (error) throw error;
        await removeItem(owner, id);
      }
    } else if (entry.entity_type === MOVEMENT_ENTITY) {
      const payload = { ...entry.payload };
      const id = entry.entity_id ?? payload.id;
      if (!id) throw new Error("Movimento local sem identificador.");
      delete payload.item;
      const { error } = await (supabase as any).from(MOVEMENT_ENTITY).upsert({ ...payload, id, clinic_id:owner.clinicId }, { onConflict: "id" });
      if (error) throw error;
    } else {
      return "skip" as const;
    }

    await markOutbox(owner.ownerId, entry.id, "done");
    return "done" as const;
  } catch (error) {
    if (error instanceof StockCompanyScopeError) {
      await markOutbox(owner.ownerId,entry.id,"conflict",error.message);
      return "conflict" as const;
    }
    const message = String((error as any)?.message ?? error ?? "Erro de sincronização do estoque");
    if (transient(error)) {
      await markOutbox(owner.ownerId, entry.id, "pending", message);
      return "network" as const;
    }
    await markOutbox(owner.ownerId, entry.id, "error", message);
    return "error" as const;
  }
}

export async function warmStockLocalCache(): Promise<{ itemsCached: number; movementsCached: number }> {
  if (!isDentalFlowDesktop() || !online()) return { itemsCached: 0, movementsCached: 0 };
  const owner = await stockCompanyScope().catch(() => null);
  if (!owner) return { itemsCached: 0, movementsCached: 0 };
  let itemsCached = 0;
  let movementsCached = 0;

  try {
    const items = await cloud.fetchStockItems();
    await writeItems(owner, items);
    itemsCached = items.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear itens de estoque", error);
  }

  try {
    const movements = await cloud.fetchStockMovements({ limit: 1000 });
    await writeMovements(owner, movements);
    movementsCached = movements.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear movimentos de estoque", error);
  }

  return { itemsCached, movementsCached };
}

export async function syncPendingStockChanges(): Promise<StockOfflineSyncSummary> {
  if (!isDentalFlowDesktop() || !online()) return { processed: 0, failed: 0, conflicts: 0, itemsCached: 0, movementsCached: 0 };
  const owner = await stockCompanyScope().catch(() => null);
  if (!owner) return { processed: 0, failed: 0, conflicts: 0, itemsCached: 0, movementsCached: 0 };

  const entries = (await getPendingOutbox<Record<string, any>>(owner.ownerId, 500)).filter((entry) => [ITEM_ENTITY, MOVEMENT_ENTITY].includes(entry.entity_type));
  let processed = 0;
  let failed = 0;
  let conflicts = 0;
  for (const entry of entries) {
    const result = await syncEntry(owner, entry);
    if (result === "done") processed += 1;
    if (result === "error") failed += 1;
    if (result === "conflict") conflicts += 1;
    if (result === "network") break;
  }
  if (processed > 0) await clearDoneOutbox(owner.ownerId);
  const warmed = await warmStockLocalCache();
  return { processed, failed, conflicts, ...warmed };
}
