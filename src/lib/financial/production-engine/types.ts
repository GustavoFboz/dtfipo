// Financial Production Engine — types only, no calculations yet.
// This engine reacts to case status transitions and will (in the future)
// materialize financial movements. For now it only records events + logs.

export type ProductionEventType =
  | "case_finalized"
  | "case_delivered"
  | "case_paid";

export type ProductionEventStatus =
  | "pending"
  | "processed"
  | "skipped"
  | "failed";

export type ProductionEventLogLevel = "info" | "warn" | "error";

export interface ProductionEventPayload {
  /** Free-form context passed by the emitter. Never trust for money math. */
  [key: string]: unknown;
}

export interface ProductionEvent {
  id: string;
  clinic_id: string;
  case_id: string | null;
  event_type: ProductionEventType;
  previous_status: string | null;
  new_status: string | null;
  triggered_by: string | null;
  payload: ProductionEventPayload;
  status: ProductionEventStatus;
  processed_at: string | null;
  error_message: string | null;
  related_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewProductionEvent {
  clinic_id: string;
  case_id?: string | null;
  event_type: ProductionEventType;
  previous_status?: string | null;
  new_status?: string | null;
  triggered_by?: string | null;
  payload?: ProductionEventPayload;
}

export interface ProductionEventLog {
  id: string;
  event_id: string;
  listener_name: string;
  level: ProductionEventLogLevel;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

/** Contract every future listener must satisfy. */
export interface ProductionEventListener {
  name: string;
  /** Which events this listener wants. */
  handles: ProductionEventType[];
  /**
   * Executed against a persisted event. MUST NOT throw — return the outcome
   * so the dispatcher can log it deterministically.
   */
  handle: (event: ProductionEvent) => Promise<ListenerResult>;
}

export interface ListenerResult {
  outcome: "processed" | "skipped" | "failed";
  message?: string;
  details?: Record<string, unknown>;
}

/** Status → event type mapping. Kept isolated so callers stay decoupled. */
export const CASE_STATUS_EVENT_MAP: Record<string, ProductionEventType> = {
  finalizado: "case_finalized",
  finalized: "case_finalized",
  entregue: "case_delivered",
  delivered: "case_delivered",
  pago: "case_paid",
  paid: "case_paid",
};
