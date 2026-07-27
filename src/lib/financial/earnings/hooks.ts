import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { professionalEarningsService } from "./services";
import type { EarningLifecycleStatus } from "./types";

const KEY = ["financial_professional_earnings"] as const;

export function useProfessionalEarnings(filters: Parameters<typeof professionalEarningsService.list>[0] = {}) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: () => professionalEarningsService.list(filters),
  });
}

export function useProfessionalEarning(id: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: () => (id ? professionalEarningsService.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useProfessionalEarningHistory(id: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "history", id],
    queryFn: () => (id ? professionalEarningsService.history(id) : Promise.resolve([])),
    enabled: !!id,
  });
}

export function useTransitionEarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to, notes }: { id: string; to: EarningLifecycleStatus; notes?: string }) =>
      professionalEarningsService.transition(id, to, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRegisterEarningsFromCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof professionalEarningsService.registerFromCalculation>[0]) =>
      professionalEarningsService.registerFromCalculation(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
