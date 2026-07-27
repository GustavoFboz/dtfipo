import type {
  ListenerResult,
  ProductionEvent,
  ProductionEventListener,
  ProductionEventType,
} from "./types";
import { CASE_STATUS_EVENT_MAP } from "./types";
import { productionEventLogsService, productionEventsService } from "./services";

/**
 * In-memory listener registry. Modules register their listener once at import
 * time via `registerProductionListener(...)`. The registry lives only on the
 * client for now — the persisted event log in Supabase is the source of truth.
 */
const listeners: ProductionEventListener[] = [];

export function registerProductionListener(listener: ProductionEventListener) {
  if (listeners.some((l) => l.name === listener.name)) return;
  listeners.push(listener);
}

export function getRegisteredListeners(): readonly ProductionEventListener[] {
  return listeners;
}

/**
 * Resolve a case status transition to an event type.
 * Returns null when the transition is not financially relevant.
 */
export function resolveEventTypeFromStatus(
  newStatus: string | null | undefined,
): ProductionEventType | null {
  if (!newStatus) return null;
  return CASE_STATUS_EVENT_MAP[newStatus.trim().toLowerCase()] ?? null;
}

/**
 * Entry point called by domain code when a case changes status.
 * Today: records the event only. No calculations, no financial writes.
 * The dispatcher fans out to registered listeners but treats every result
 * as advisory — nothing here mutates money.
 */
export async function dispatchCaseStatusChange(input: {
  clinicId: string;
  caseId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  triggeredBy?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ eventType: ProductionEventType | null; skipped: boolean }> {
  const eventType = resolveEventTypeFromStatus(input.newStatus);
  if (!eventType) return { eventType: null, skipped: true };

  const event = await productionEventsService.emit({
    clinic_id: input.clinicId,
    case_id: input.caseId,
    event_type: eventType,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    triggered_by: input.triggeredBy ?? null,
    payload: input.payload ?? {},
  });

  // Emit is a no-op today — bail out gracefully without touching listeners.
  if (!event) return { eventType, skipped: true };

  await runListeners(event);
  return { eventType, skipped: false };
}

async function runListeners(event: ProductionEvent) {
  const targets = listeners.filter((l) => l.handles.includes(event.event_type));
  for (const listener of targets) {
    let result: ListenerResult;
    try {
      result = await listener.handle(event);
    } catch (err) {
      result = {
        outcome: "failed",
        message: err instanceof Error ? err.message : "listener threw",
      };
    }
    await productionEventLogsService.record(
      event.id,
      listener.name,
      result.outcome === "failed" ? "error" : "info",
      result.message ?? `listener ${listener.name} ${result.outcome}`,
      result.details,
    );
  }
}
