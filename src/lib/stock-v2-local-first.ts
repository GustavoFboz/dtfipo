import { supabase } from "@/integrations/supabase/client";
import * as cloud from "./stock-v2";
import type { StockCategory, StockItemV2 } from "./stock-v2";
import {
  clearDoneOutbox,
  enqueueOutbox,
  getPendingOutbox,
  isDentalFlowDesktop,
  localCacheGet,
  localCachePut,
  markOutbox,
  type OutboxEntry,
} from "./desktop-local";

const CATEGORIES_NS = "stock-v2-categories:v1";
const ITEMS_NS = "stock-v2-items:v1";
const ALL_KEY = "all";
const CATEGORY_ENTITY = "component_categories";
const ITEM_ENTITY = "stock_v2_items";
const ADJUST_ENTITY = "stock_v2_adjust";
const LINK_IMPLANT_ENTITY = "stock_v2_link_implant";

export type StockV2OfflineSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  categoriesCached: number;
  itemsCached: number;
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

async function ownerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function requireOwnerId() {
  const id = await ownerId();
  if (!id) throw new Error("Sua sessão local não está disponível. Conecte-se novamente para revalidar este dispositivo.");
  return id;
}

async function readCategories(owner: string) {
  const entry = await localCacheGet<StockCategory[]>(owner, CATEGORIES_NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeCategories(owner: string, rows: StockCategory[]) {
  await localCachePut(owner, CATEGORIES_NS, ALL_KEY, [...rows].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR")));
}

async function readItems(owner: string) {
  const entry = await localCacheGet<StockItemV2[]>(owner, ITEMS_NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeItems(owner: string, rows: StockItemV2[]) {
  await localCachePut(owner, ITEMS_NS, ALL_KEY, [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
}

async function upsertCategory(owner: string, row: StockCategory) {
  const current = await readCategories(owner);
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [...current, row];
  await writeCategories(owner, next);
}

async function upsertItem(owner: string, row: StockItemV2) {
  const current = await readItems(owner);
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [...current, row];
  await writeItems(owner, next);
}

function categoryEnum(name: string | undefined) {
  const normalized = (name ?? "").toLowerCase();
  if (normalized.includes("zirc")) return "zirconia";
  if (normalized.includes("diss")) return "dissilicato";
  if (normalized.includes("higien") || normalized.includes("consum")) return "hygiene";
  return "component";
}

export async function fetchStockCategoriesV2LocalFirst(): Promise<StockCategory[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchStockCategoriesV2();
  const owner = await requireOwnerId();
  if (online()) {
    try {
      const rows = await cloud.fetchStockCategoriesV2();
      await writeCategories(owner, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return readCategories(owner);
}

export async function fetchStockItemsV2LocalFirst(): Promise<StockItemV2[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchStockItemsV2();
  const owner = await requireOwnerId();
  if (online()) {
    try {
      const rows = await cloud.fetchStockItemsV2();
      await writeItems(owner, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return readItems(owner);
}

export async function createStockCategoryV2LocalFirst(name: string, position = 1000) {
  if (!isDentalFlowDesktop()) return cloud.createStockCategoryV2(name, position);
  const owner = await requireOwnerId();
  const local: StockCategory = { id: uuid(), name, position, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  const queue = async () => {
    await upsertCategory(owner, local);
    await enqueueOutbox({ ownerId: owner, entityType: CATEGORY_ENTITY, entityId: local.id, operation: "create", payload: local });
    return local;
  };

  if (!online()) return queue();
  try {
    const saved = await cloud.createStockCategoryV2(name, position);
    await upsertCategory(owner, saved);
    return saved;
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function updateStockCategoryV2LocalFirst(id: string, patch: Partial<StockCategory>) {
  if (!isDentalFlowDesktop()) return cloud.updateStockCategoryV2(id, patch);
  const owner = await requireOwnerId();
  const existing = (await readCategories(owner)).find((row) => row.id === id);
  if (!existing) throw new Error("Categoria ainda não está disponível localmente.");
  const local = { ...existing, ...patch, id, updated_at: new Date().toISOString() };
  const queue = async () => {
    await upsertCategory(owner, local);
    await enqueueOutbox({ ownerId: owner, entityType: CATEGORY_ENTITY, entityId: id, operation: "update", payload: patch });
  };
  if (!online()) return queue();
  try {
    await cloud.updateStockCategoryV2(id, patch);
    await upsertCategory(owner, local);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function deleteStockCategoryV2LocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.deleteStockCategoryV2(id);
  const owner = await requireOwnerId();
  const queue = async () => {
    await writeCategories(owner, (await readCategories(owner)).filter((row) => row.id !== id));
    await enqueueOutbox({ ownerId: owner, entityType: CATEGORY_ENTITY, entityId: id, operation: "delete", payload: { id } });
  };
  if (!online()) return queue();
  try {
    await cloud.deleteStockCategoryV2(id);
    await writeCategories(owner, (await readCategories(owner)).filter((row) => row.id !== id));
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function createStockItemV2LocalFirst(input: Parameters<typeof cloud.createStockItemV2>[0]): Promise<string> {
  if (!isDentalFlowDesktop()) return cloud.createStockItemV2(input);
  const owner = await requireOwnerId();
  const id = uuid();
  const now = new Date().toISOString();
  const local: StockItemV2 = {
    id,
    category_id: input.category_id,
    category: categoryEnum(input.category_name),
    name: input.name,
    brand: input.brand ?? null,
    type: input.type ?? null,
    unit: input.unit ?? "un",
    qty_on_hand: input.qty_on_hand ?? 0,
    min_qty: input.min_qty ?? 0,
    notes: input.notes ?? null,
    last_restocked_at: null,
    created_at: now,
    updated_at: now,
    requires_sintering: input.requires_sintering ?? false,
    implant_system_component_id: null,
    custom_fields: (input.custom_fields ?? []).filter((field) => field.key.trim()).map((field) => ({ id: uuid(), stock_item_id: id, key: field.key.trim(), value: field.value })),
  };

  const queue = async () => {
    await upsertItem(owner, local);
    await enqueueOutbox({ ownerId: owner, entityType: ITEM_ENTITY, entityId: id, operation: "create", payload: { id, input } });
    return id;
  };

  if (!online()) return queue();
  try {
    const savedId = await cloud.createStockItemV2(input);
    const rows = await cloud.fetchStockItemsV2();
    await writeItems(owner, rows);
    return savedId;
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function updateStockItemV2LocalFirst(
  id: string,
  patch: Partial<StockItemV2> & { category_name?: string },
  customFields?: { id?: string; key: string; value: string }[],
) {
  if (!isDentalFlowDesktop()) return cloud.updateStockItemV2(id, patch, customFields);
  const owner = await requireOwnerId();
  const existing = (await readItems(owner)).find((row) => row.id === id);
  if (!existing) throw new Error("Item ainda não está disponível localmente.");
  const normalizedPatch: any = { ...patch };
  if (patch.category_name) normalizedPatch.category = categoryEnum(patch.category_name);
  delete normalizedPatch.category_name;
  delete normalizedPatch.custom_fields;
  const local: StockItemV2 = {
    ...existing,
    ...normalizedPatch,
    id,
    updated_at: new Date().toISOString(),
    custom_fields: customFields
      ? customFields.filter((field) => field.key.trim()).map((field) => ({ id: field.id ?? uuid(), stock_item_id: id, key: field.key.trim(), value: field.value }))
      : existing.custom_fields,
  };

  const queue = async () => {
    await upsertItem(owner, local);
    await enqueueOutbox({ ownerId: owner, entityType: ITEM_ENTITY, entityId: id, operation: "update", payload: { patch, custom_fields: customFields ?? null } });
  };

  if (!online()) return queue();
  try {
    await cloud.updateStockItemV2(id, patch, customFields);
    await upsertItem(owner, local);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function deleteStockItemV2LocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.deleteStockItemV2(id);
  const owner = await requireOwnerId();
  const queue = async () => {
    await writeItems(owner, (await readItems(owner)).filter((row) => row.id !== id));
    await enqueueOutbox({ ownerId: owner, entityType: ITEM_ENTITY, entityId: id, operation: "delete", payload: { id } });
  };
  if (!online()) return queue();
  try {
    await cloud.deleteStockItemV2(id);
    await writeItems(owner, (await readItems(owner)).filter((row) => row.id !== id));
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function adjustStockV2LocalFirst(itemId: string, delta: number, notes?: string) {
  if (delta === 0) return;
  if (!isDentalFlowDesktop()) return cloud.adjustStockV2(itemId, delta, notes);
  const owner = await requireOwnerId();
  const existing = (await readItems(owner)).find((row) => row.id === itemId);
  if (!existing) throw new Error("Item ainda não está disponível localmente.");
  const nextQty = Number(existing.qty_on_hand ?? 0) + delta;
  if (nextQty < 0) throw new Error("Estoque local insuficiente para este ajuste.");

  const queue = async () => {
    await upsertItem(owner, { ...existing, qty_on_hand: nextQty, updated_at: new Date().toISOString(), last_restocked_at: delta > 0 ? new Date().toISOString() : existing.last_restocked_at });
    await enqueueOutbox({ ownerId: owner, entityType: ADJUST_ENTITY, entityId: uuid(), operation: "create", payload: { itemId, delta, notes: notes ?? null } });
  };

  if (!online()) return queue();
  try {
    await cloud.adjustStockV2(itemId, delta, notes);
    const rows = await cloud.fetchStockItemsV2();
    await writeItems(owner, rows);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function linkStockItemToImplantSystemLocalFirst(itemId: string, itemName: string, systemId: string | null, currentComponentId?: string | null) {
  if (!isDentalFlowDesktop()) return cloud.linkStockItemToImplantSystem(itemId, itemName, systemId, currentComponentId);
  const owner = await requireOwnerId();
  const existing = (await readItems(owner)).find((row) => row.id === itemId);

  const queue = async () => {
    if (existing && !systemId) await upsertItem(owner, { ...existing, implant_system_component_id: null, updated_at: new Date().toISOString() });
    await enqueueOutbox({
      ownerId: owner,
      entityType: LINK_IMPLANT_ENTITY,
      entityId: itemId,
      operation: "set",
      payload: { itemId, itemName, systemId, currentComponentId: currentComponentId ?? null },
    });
  };

  if (!online()) return queue();
  try {
    await cloud.linkStockItemToImplantSystem(itemId, itemName, systemId, currentComponentId);
    await writeItems(owner, await cloud.fetchStockItemsV2());
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

async function syncEntry(owner: string, entry: OutboxEntry<Record<string, any>>) {
  await markOutbox(owner, entry.id, "syncing");
  try {
    if (entry.entity_type === CATEGORY_ENTITY) {
      const id = entry.entity_id ?? entry.payload.id;
      if (!id) throw new Error("Categoria local sem identificador.");
      if (entry.operation === "create") {
        const { data, error } = await (supabase as any).from(CATEGORY_ENTITY).upsert({ ...entry.payload, id }, { onConflict: "id" }).select().single();
        if (error) throw error;
        await upsertCategory(owner, data as StockCategory);
      } else if (entry.operation === "update") {
        const { data, error } = await (supabase as any).from(CATEGORY_ENTITY).update(entry.payload).eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) return await conflict(owner, entry, "A categoria não existe mais no servidor.");
        await upsertCategory(owner, data as StockCategory);
      } else if (entry.operation === "delete") {
        const { error } = await (supabase as any).from(CATEGORY_ENTITY).delete().eq("id", id);
        if (error) throw error;
      }
    } else if (entry.entity_type === ITEM_ENTITY) {
      const id = entry.entity_id;
      if (!id) throw new Error("Item local sem identificador.");
      if (entry.operation === "create") {
        const input = entry.payload.input ?? {};
        const itemPayload = {
          id,
          category_id: input.category_id,
          category: categoryEnum(input.category_name),
          name: input.name,
          brand: input.brand ?? null,
          type: input.type ?? null,
          unit: input.unit ?? "un",
          qty_on_hand: input.qty_on_hand ?? 0,
          min_qty: input.min_qty ?? 0,
          notes: input.notes ?? null,
          requires_sintering: input.requires_sintering ?? false,
        };
        const { error } = await (supabase as any).from("stock_items").upsert(itemPayload, { onConflict: "id" });
        if (error) throw error;
        const custom = (input.custom_fields ?? []).filter((field: any) => String(field.key ?? "").trim()).map((field: any) => ({ stock_item_id: id, key: String(field.key).trim(), value: field.value ?? null }));
        if (custom.length) {
          await (supabase as any).from("stock_item_custom_fields").delete().eq("stock_item_id", id);
          const { error: customError } = await (supabase as any).from("stock_item_custom_fields").insert(custom);
          if (customError) throw customError;
        }
      } else if (entry.operation === "update") {
        const patch = { ...(entry.payload.patch ?? {}) };
        if (patch.category_name) patch.category = categoryEnum(patch.category_name);
        delete patch.category_name;
        delete patch.custom_fields;
        const { data, error } = await (supabase as any).from("stock_items").update(patch).eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) return await conflict(owner, entry, "O item não existe mais no servidor.");
        if (entry.payload.custom_fields) {
          await (supabase as any).from("stock_item_custom_fields").delete().eq("stock_item_id", id);
          const rows = entry.payload.custom_fields.filter((field: any) => String(field.key ?? "").trim()).map((field: any) => ({ stock_item_id: id, key: String(field.key).trim(), value: field.value ?? null }));
          if (rows.length) {
            const { error: customError } = await (supabase as any).from("stock_item_custom_fields").insert(rows);
            if (customError) throw customError;
          }
        }
      } else if (entry.operation === "delete") {
        const { error } = await (supabase as any).from("stock_items").delete().eq("id", id);
        if (error) throw error;
      }
    } else if (entry.entity_type === ADJUST_ENTITY) {
      const { itemId, delta, notes } = entry.payload;
      const { error } = await (supabase as any).from("stock_movements").upsert({
        id: entry.entity_id ?? entry.id,
        stock_item_id: itemId,
        type: Number(delta) > 0 ? "in" : "adjust",
        qty: Number(delta),
        qty_before: 0,
        qty_after: 0,
        user_id: owner,
        notes: notes ?? (Number(delta) > 0 ? "Reposição" : "Ajuste"),
      }, { onConflict: "id" });
      if (error) throw error;
    } else if (entry.entity_type === LINK_IMPLANT_ENTITY) {
      const { itemId, itemName, systemId, currentComponentId } = entry.payload;
      await cloud.linkStockItemToImplantSystem(itemId, itemName, systemId ?? null, currentComponentId ?? null);
    } else {
      return "skip" as const;
    }

    await markOutbox(owner, entry.id, "done");
    return "done" as const;
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "Erro de sincronização do estoque v2");
    if (transient(error)) {
      await markOutbox(owner, entry.id, "pending", message);
      return "network" as const;
    }
    await markOutbox(owner, entry.id, "error", message);
    return "error" as const;
  }
}

async function conflict(owner: string, entry: OutboxEntry, message: string) {
  await markOutbox(owner, entry.id, "conflict", message);
  return "conflict" as const;
}

export async function warmStockV2LocalCache(): Promise<{ categoriesCached: number; itemsCached: number }> {
  if (!isDentalFlowDesktop() || !online()) return { categoriesCached: 0, itemsCached: 0 };
  const owner = await ownerId();
  if (!owner) return { categoriesCached: 0, itemsCached: 0 };
  let categoriesCached = 0;
  let itemsCached = 0;
  try {
    const rows = await cloud.fetchStockCategoriesV2();
    await writeCategories(owner, rows);
    categoriesCached = rows.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear categorias de estoque", error);
  }
  try {
    const rows = await cloud.fetchStockItemsV2();
    await writeItems(owner, rows);
    itemsCached = rows.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear estoque v2", error);
  }
  return { categoriesCached, itemsCached };
}

export async function syncPendingStockV2Changes(): Promise<StockV2OfflineSyncSummary> {
  if (!isDentalFlowDesktop() || !online()) return { processed: 0, failed: 0, conflicts: 0, categoriesCached: 0, itemsCached: 0 };
  const owner = await ownerId();
  if (!owner) return { processed: 0, failed: 0, conflicts: 0, categoriesCached: 0, itemsCached: 0 };
  const supported = new Set([CATEGORY_ENTITY, ITEM_ENTITY, ADJUST_ENTITY, LINK_IMPLANT_ENTITY]);
  const entries = (await getPendingOutbox<Record<string, any>>(owner, 500)).filter((entry) => supported.has(entry.entity_type));
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
  if (processed > 0) await clearDoneOutbox(owner);
  const warmed = await warmStockV2LocalCache();
  return { processed, failed, conflicts, ...warmed };
}
