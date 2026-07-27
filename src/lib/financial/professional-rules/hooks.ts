import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { professionalRulesService } from "./services";
import type { FinancialProfessionalRule, NewFinancialProfessionalRule } from "./types";

const KEY = ["financial_professional_rules"] as const;

export function useProfessionalRules(filters: { user_id?: string; is_active?: boolean } = {}) {
  return useQuery<FinancialProfessionalRule[]>({
    queryKey: [...KEY, "list", filters],
    queryFn: () => professionalRulesService.list(filters),
  });
}

export function useProfessionalRule(id: string | null | undefined) {
  return useQuery<FinancialProfessionalRule | null>({
    queryKey: [...KEY, "one", id],
    queryFn: () => (id ? professionalRulesService.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateProfessionalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NewFinancialProfessionalRule>) => professionalRulesService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateProfessionalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FinancialProfessionalRule> }) =>
      professionalRulesService.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProfessionalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => professionalRulesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
