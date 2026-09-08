import { supabase } from "@/integrations/supabase/client";
import type { Notification } from "./types";
import * as cloud from "./api";
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
import { requireDesktopOwnerId, resolveDesktopOwnerId } from "./desktop-identity";

const NS = "notifications:v1";
const ALL_KEY = "all";
const ENTITY = "notifications";

type NotificationOutboxPayload =
  | { id: string; read_at: string }
  | { ids: string[]; read_at: string }
  | { id: string }
  | {
      targetUserId: string | null;
      title: string;
      content: string;
      type: string;
      metadata: Record<string, unknown>;
    };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "connection",
    "offline",
    "timeout",
    "cloud login",
    "revalidation",
    "revalidação",
  ].some((x) => message.includes(x));
}

async function readAll(ownerId: string) {
  const entry = await localCacheGet<Notification[]>(ownerId, NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeAll(ownerId: string, rows: Notification[]) {
  const sorted = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  await localCachePut(ownerId, NS, ALL_KEY, sorted);
}

export async function fetchNotificationsLocalFirst(): Promise<Notification[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchNotifications();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchNotifications();
      await writeAll(ownerId, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  return readAll(ownerId);
}

export async function markNotificationAsReadLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.markNotificationAsRead(id);
  const ownerId = await requireDesktopOwnerId();
  const readAt = new Date().toISOString();

  if (online()) {
    try {
      await cloud.markNotificationAsRead(id);
      const rows = await readAll(ownerId);
      await writeAll(ownerId, rows.map((row) => (row.id === id ? { ...row, read_at: readAt } : row)));
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const rows = await readAll(ownerId);
  await writeAll(ownerId, rows.map((row) => (row.id === id ? { ...row, read_at: readAt } : row)));
  await enqueueOutbox({ ownerId, entityType: ENTITY, entityId: id, operation: "mark_read", payload: { id, read_at: readAt } });
}

export async function markCaseNotificationsReadLocalFirst(caseId: string, types?: string[]): Promise<string[]> {
  if (!isDentalFlowDesktop()) return cloud.markCaseNotificationsRead(caseId, types);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      const ids = await cloud.markCaseNotificationsRead(caseId, types);
      if (ids.length) {
        const rows = await readAll(ownerId);
        const readAt = new Date().toISOString();
        const set = new Set(ids);
        await writeAll(ownerId, rows.map((row) => (set.has(row.id) ? { ...row, read_at: readAt } : row)));
      }
      return ids;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const rows = await readAll(ownerId);
  const matched = rows.filter((row) => {
    if (row.read_at) return false;
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    if (String(metadata.case_id ?? "") !== caseId) return false;
    return !types?.length || types.includes(String(row.type ?? ""));
  });
  if (!matched.length) return [];
  const ids = matched.map((row) => row.id);
  const set = new Set(ids);
  const readAt = new Date().toISOString();
  await writeAll(ownerId, rows.map((row) => (set.has(row.id) ? { ...row, read_at: readAt } : row)));
  await enqueueOutbox({ ownerId, entityType: ENTITY, operation: "mark_many_read", payload: { ids, read_at: readAt } });
  return ids;
}

export async function markAllNotificationsAsReadLocalFirst() {
  if (!isDentalFlowDesktop()) return cloud.markAllNotificationsAsRead();
  const ownerId = await requireDesktopOwnerId();
  const rows = await readAll(ownerId);
  const ids = rows.filter((row) => !row.read_at).map((row) => row.id);
  const readAt = new Date().toISOString();

  if (online()) {
    try {
      await cloud.markAllNotificationsAsRead();
      await writeAll(ownerId, rows.map((row) => ({ ...row, read_at: row.read_at ?? readAt })));
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  await writeAll(ownerId, rows.map((row) => ({ ...row, read_at: row.read_at ?? readAt })));
  if (ids.length) {
    await enqueueOutbox({ ownerId, entityType: ENTITY, operation: "mark_many_read", payload: { ids, read_at: readAt } });
  }
}

export async function deleteNotificationLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.adminDelete("notifications", id);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      await cloud.adminDelete("notifications", id);
      const rows = await readAll(ownerId);
      await writeAll(ownerId, rows.filter((row) => row.id !== id));
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const rows = await readAll(ownerId);
  await writeAll(ownerId, rows.filter((row) => row.id !== id));
  await enqueueOutbox({ ownerId, entityType: ENTITY, entityId: id, operation: "delete", payload: { id } });
}

export async function sendInternalNotificationLocalFirst(
  targetUserId: string | null,
  title: string,
  content: string,
  type = "system",
  metadata: Record<string, unknown> = {},
) {
  if (!isDentalFlowDesktop()) return cloud.sendInternalNotification(targetUserId, title, content, type, metadata);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      return await cloud.sendInternalNotification(targetUserId, title, content, type, metadata);
    } catch (error) {
      // A temporary Cloud Login revalidation gap is recoverable and must be
      // treated exactly like a network interruption. Previous builds classified
      // it as fatal, so CaseComments swallowed the rejection and the alert was
      // permanently lost even though the chat message itself was saved.
      if (!transient(error)) throw error;
    }
  }

  await enqueueOutbox({
    ownerId,
    entityType: ENTITY,
    operation: "send",
    payload: { targetUserId, title, content, type, metadata },
  });
}

async function processNotificationEntry(ownerId: string, entry: OutboxEntry<NotificationOutboxPayload>) {
  const payload: any = entry.payload ?? {};
  switch (entry.operation) {
    case "mark_read":
      await cloud.markNotificationAsRead(String(payload.id));
      return;
    case "mark_many_read":
      for (const id of Array.isArray(payload.ids) ? payload.ids : []) {
        await cloud.markNotificationAsRead(String(id));
      }
      return;
    case "delete":
      await cloud.adminDelete("notifications", String(payload.id ?? entry.entity_id));
      return;
    case "send":
      await cloud.sendInternalNotification(
        payload.targetUserId ?? null,
        String(payload.title ?? ""),
        String(payload.content ?? ""),
        String(payload.type ?? "system"),
        (payload.metadata ?? {}) as Record<string, unknown>,
      );
      return;
    default:
      throw new Error(`Operação offline de notificação não suportada: ${entry.operation}`);
  }
}

export async function syncPendingNotificationChanges() {
  if (!isDentalFlowDesktop() || !online()) return { processed: 0, failed: 0, conflicts: 0, cached: 0 };
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return { processed: 0, failed: 0, conflicts: 0, cached: 0 };

  const pending = (await getPendingOutbox<NotificationOutboxPayload>(ownerId, 500)).filter((entry) => entry.entity_type === ENTITY);
  let processed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      await markOutbox(ownerId, entry.id, "syncing");
      await processNotificationEntry(ownerId, entry);
      await markOutbox(ownerId, entry.id, "done");
      processed += 1;
    } catch (error) {
      failed += 1;
      await markOutbox(ownerId, entry.id, "error", String((error as any)?.message ?? error));
    }
  }
  await clearDoneOutbox(ownerId);

  let cached = 0;
  try {
    const rows = await cloud.fetchNotifications();
    await writeAll(ownerId, rows);
    cached = rows.length;
  } catch (error) {
    console.warn("[DentalFlow Desktop] Não foi possível atualizar notificações locais", error);
  }

  return { processed, failed, conflicts: 0, cached };
}

export async function warmNotificationLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return 0;
  const rows = await cloud.fetchNotifications();
  await writeAll(ownerId, rows);
  return rows.length;
}