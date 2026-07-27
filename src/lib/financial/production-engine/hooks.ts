import { useQuery } from "@tanstack/react-query";
import {
  productionEventLogsService,
  productionEventsService,
} from "./services";
import type { ProductionEventStatus, ProductionEventType } from "./types";

export function useProductionEvents(
  clinicId: string | undefined,
  opts?: {
    type?: ProductionEventType;
    status?: ProductionEventStatus;
    caseId?: string;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["financial", "production-events", clinicId, opts],
    queryFn: () => productionEventsService.list(clinicId!, opts),
    enabled: !!clinicId,
  });
}

export function useProductionEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["financial", "production-event", eventId],
    queryFn: () => productionEventsService.get(eventId!),
    enabled: !!eventId,
  });
}

export function useProductionEventLogs(eventId: string | undefined) {
  return useQuery({
    queryKey: ["financial", "production-event-logs", eventId],
    queryFn: () => productionEventLogsService.listByEvent(eventId!),
    enabled: !!eventId,
  });
}
