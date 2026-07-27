import { supabase } from "@/integrations/supabase/client";
import type {
  NewProductionEvent,
  ProductionEvent,
  ProductionEventLog,
  ProductionEventLogLevel,
  ProductionEventStatus,
  ProductionEventType,
} from "./types";

// NOTE: writes to these tables are service_role only (see migration).
// The methods below use the client for reads. Writes will be wired through
// server functions once the engine goes live. Kept here as no-op stubs so
// callers can adopt the API surface now without breaking anything.

export const productionEventsService = {
  async list(clinicId: string, opts?: {
    type?: ProductionEventType;
    status?: ProductionEventStatus;
    caseId?: string;
    limit?: number;
  }): Promise<ProductionEvent[]> {
    let q = supabase
      .from("financial_production_events" as never)
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.type) q = q.eq("event_type", opts.type);
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.caseId) q = q.eq("case_id", opts.caseId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ProductionEvent[];
  },

  async get(id: string): Promise<ProductionEvent | null> {
    const { data, error } = await supabase
      .from("financial_production_events" as never)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as ProductionEvent) ?? null;
  },

  /**
   * Placeholder — writes require service_role. Wire through a
   * requireSupabaseAuth server function when the engine goes live.
   */
  async emit(_event: NewProductionEvent): Promise<ProductionEvent | null> {
    // Intentionally a no-op today. Kept so call sites can be added safely.
    return null;
  },
};

export const productionEventLogsService = {
  async listByEvent(eventId: string): Promise<ProductionEventLog[]> {
    const { data, error } = await supabase
      .from("financial_production_event_logs" as never)
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ProductionEventLog[];
  },

  /** Placeholder — writes require service_role. */
  async record(
    _eventId: string,
    _listenerName: string,
    _level: ProductionEventLogLevel,
    _message: string,
    _details?: Record<string, unknown>,
  ): Promise<void> {
    // no-op today
  },
};
