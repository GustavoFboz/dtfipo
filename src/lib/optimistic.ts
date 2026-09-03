import type { QueryClient, QueryKey } from "@tanstack/react-query";

type Row = Record<string, any> & { id: string };

// ---------- Tombstones (prevent deleted rows from re-appearing) ----------
// Após uma exclusão, um refetch em voo ou um evento postgres_changes atrasado
// pode reinserir a linha por instantes até chegar o DELETE. Guardamos um
// tombstone curto para ignorar qualquer insert/patch com o mesmo id.

const TOMBSTONE_TTL_MS = 60_000;
const tombstones = new Map<string, number>();

export function markDeleted(id: string, ttlMs: number = TOMBSTONE_TTL_MS) {
  if (!id) return;
  if (ttlMs < 0) {
    tombstones.delete(id);
  } else {
    tombstones.set(id, Date.now() + ttlMs);
  }
}

export function isDeleted(id: string): boolean {
  if (!id) return false;
  const exp = tombstones.get(id);
  if (!exp) return false;
  if (exp < Date.now()) {
    tombstones.delete(id);
    return false;
  }
  return true;
}

// ---------- Cache utilities ----------

export function patchListsById<T extends Row>(
  qc: QueryClient,
  queryKey: QueryKey,
  id: string,
  patch: Partial<T>,
) {
  if (isDeleted(id)) return;
  qc.setQueriesData<T[]>({ queryKey }, (old) =>
    Array.isArray(old) ? old.map((r) => (r.id === id ? { ...r, ...patch } : r)) : old,
  );
}

export function removeFromListsById<T extends Row>(
  qc: QueryClient,
  queryKey: QueryKey,
  id: string,
) {
  markDeleted(id);
  qc.setQueriesData<T[]>({ queryKey }, (old) =>
    Array.isArray(old) ? old.filter((r) => r.id !== id) : old,
  );
}

export function insertIntoLists<T extends Row>(
  qc: QueryClient,
  queryKey: QueryKey,
  row: T,
  position: "start" | "end" = "start",
) {
  if (isDeleted(row.id)) return;
  qc.setQueriesData<T[]>({ queryKey }, (old) => {
    if (!Array.isArray(old)) return old;
    if (old.some((r) => r.id === row.id)) return old.map((r) => (r.id === row.id ? { ...r, ...row } : r));
    return position === "start" ? [row, ...old] : [...old, row];
  });
}

export function snapshotQueries<T = unknown>(qc: QueryClient, queryKey: QueryKey) {
  return qc.getQueriesData<T>({ queryKey });
}

export function restoreQueries(qc: QueryClient, snap: [QueryKey, unknown][]) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

const STOCK_ITEM_QUERY_PREFIXES: QueryKey[] = [
  ["stock_items"],
  ["stock_items_v2"],
  ["stock_items_all"],
  ["implant_stock_items"],
  ["rule_items"],
  ["eligible_items"],
];

function findStockItemQty(qc: QueryClient, itemId: string, fallbackQty?: number | null) {
  for (const queryKey of STOCK_ITEM_QUERY_PREFIXES) {
    const rows = qc.getQueriesData<Record<string, any>[]>({ queryKey });
    for (const [, data] of rows) {
      if (!Array.isArray(data)) continue;
      const row = data.find((r) => r?.id === itemId);
      if (row && row.qty_on_hand !== undefined && row.qty_on_hand !== null) return Number(row.qty_on_hand);
    }
  }
  return fallbackQty === undefined || fallbackQty === null ? null : Number(fallbackQty);
}

export function patchStockItemInQueries(qc: QueryClient, itemId: string, patch: Record<string, any>) {
  for (const queryKey of STOCK_ITEM_QUERY_PREFIXES) {
    qc.setQueriesData<Record<string, any>[]>({ queryKey }, (old) =>
      Array.isArray(old) ? old.map((row) => (row?.id === itemId ? { ...row, ...patch } : row)) : old,
    );
  }
}

export function broadcastStockItemPatch(itemId: string, patch: Record<string, any>) {
  broadcastEntity("stock_items", "update", { id: itemId, ...patch, updated_at: new Date().toISOString() });
}

export function optimisticAdjustStockItemQuantity(
  qc: QueryClient,
  itemId: string,
  delta: number,
  fallbackQty?: number | null,
) {
  const previousQty = findStockItemQty(qc, itemId, fallbackQty);
  if (previousQty === null || !Number.isFinite(previousQty)) {
    return { previousQty: null, nextQty: null, rollback: () => {} };
  }

  const nextQty = Math.max(0, previousQty + delta);
  const patch = { qty_on_hand: nextQty };
  patchStockItemInQueries(qc, itemId, patch);
  broadcastStockItemPatch(itemId, patch);

  return {
    previousQty,
    nextQty,
    rollback: () => {
      const rollbackPatch = { qty_on_hand: previousQty };
      patchStockItemInQueries(qc, itemId, rollbackPatch);
      broadcastStockItemPatch(itemId, rollbackPatch);
    },
  };
}

/**
 * Guarda global: sempre que o cache do React Query receber novos dados
 * (inclusive vindos de um refetch), remove linhas com id tombstoned e
 * zera resultados individuais (query key ["case", id]) que ressuscitem.
 * Evita o piscar "some → volta → some" após exclusões.
 */
export function installTombstoneGuard(qc: QueryClient) {
  return qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const action: any = (event as any).action;
    // Só reage a dados vindos do servidor / setQueryData externo — não a nós mesmos.
    if (!action || (action.type !== "success" && action.type !== "setData")) return;

    const data = event.query.state.data;
    if (Array.isArray(data)) {
      // Usamos uma verificação mais eficiente antes de chamar setData
      const needsFilter = data.some((row: any) => row?.id && isDeleted(row.id));
      if (needsFilter) {
        const filtered = data.filter((row: any) => !(row?.id && isDeleted(row.id)));
        event.query.setData(filtered as any);
      }
      return;
    }
    if (data && typeof data === "object" && (data as any).id && isDeleted((data as any).id)) {
      event.query.setData(null as any);
    }
  });
}

// ---------- Peer broadcast ----------
//
// IMPORTANT SECURITY BOUNDARY
// ---------------------------
// Full entity rows can contain patient/case/notification data. They must never
// travel over a public Supabase Broadcast topic because that channel is not a
// substitute for PostgreSQL RLS. Cross-device synchronization is handled by
// postgres_changes (which is evaluated against the authenticated database
// policies). This peer layer is therefore deliberately LOCAL-DEVICE only,
// using the browser BroadcastChannel API for instant synchronization between
// tabs of the same Dental Flow session/origin.

type BroadcastOp = "insert" | "update" | "delete";
type BroadcastPayload = { op: BroadcastOp; row: any; senderId: string };
type LocalChannelState = {
  channel: BroadcastChannel | null;
  listeners: Set<(payload: BroadcastPayload) => void>;
};

const SENDER_ID = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
})();

const localChannels = new Map<string, LocalChannelState>();

function getLocalChannel(entity: string): LocalChannelState {
  let state = localChannels.get(entity);
  if (state) return state;

  state = {
    channel: null,
    listeners: new Set(),
  };
  localChannels.set(entity, state);

  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(`dentalflow:entity:${entity}`);
    state.channel = channel;
    channel.onmessage = (event: MessageEvent<BroadcastPayload>) => {
      const payload = event.data;
      if (!payload || payload.senderId === SENDER_ID) return;
      state!.listeners.forEach((listener) => listener(payload));
    };
  }

  return state;
}

export function broadcastEntity(entity: string, op: BroadcastOp, row: any) {
  if (typeof window === "undefined") return;
  const state = getLocalChannel(entity);
  if (!state.channel) return;
  const payload: BroadcastPayload = { op, row, senderId: SENDER_ID };
  try {
    state.channel.postMessage(payload);
  } catch (error) {
    // Local peer sync is an optimization only. The database realtime channel
    // remains authoritative and will reconcile the UI.
    console.warn("local entity broadcast failed", error);
  }
}

export function subscribeEntity(
  entity: string,
  handler: (payload: BroadcastPayload) => void,
) {
  const state = getLocalChannel(entity);
  state.listeners.add(handler);
  return () => {
    state.listeners.delete(handler);
  };
}
