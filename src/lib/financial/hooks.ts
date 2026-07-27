// React Query hooks for the Financeiro module.
// Follows the project's optimistic pattern conventions.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  financialAccountsService,
  financialBankAccountsService,
  financialCashFlowService,
  financialCategoriesService,
  financialInstallmentsService,
  financialPaymentRequestsService,
  financialPaymentRulesService,
  financialProductionService,
  financialReportsService,
  financialTransactionsService,
  financialWalletsService,
} from "./services";
import type {
  FinancialAccount,
  FinancialBankAccount,
  FinancialCashFlow,
  FinancialCategory,
  FinancialInstallment,
  FinancialPaymentRequest,
  FinancialPaymentRule,
  FinancialProductionRecord,
  FinancialReport,
  FinancialTransaction,
  FinancialWallet,
} from "./types";

type AnyService<T> = {
  list: (f?: Record<string, unknown>) => Promise<T[]>;
  get: (id: string) => Promise<T | null>;
  create: (input: Partial<T>) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
};

function makeHooks<T extends { id: string }>(key: string, service: AnyService<T>) {
  const useList = (filters: Record<string, unknown> = {}) =>
    useQuery({
      queryKey: [key, "list", filters],
      queryFn: () => service.list(filters),
    });

  const useOne = (id: string | undefined | null) =>
    useQuery({
      queryKey: [key, "one", id],
      queryFn: () => (id ? service.get(id) : Promise.resolve(null)),
      enabled: !!id,
    });

  const useCreate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (input: Partial<T>) => service.create(input),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };

  const useUpdate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => service.update(id, patch),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };

  const useRemove = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => service.remove(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };

  return { useList, useOne, useCreate, useUpdate, useRemove };
}

export const financialAccounts = makeHooks<FinancialAccount>("financial_accounts", financialAccountsService);
export const financialBankAccounts = makeHooks<FinancialBankAccount>("financial_bank_accounts", financialBankAccountsService);
export const financialWallets = makeHooks<FinancialWallet>("financial_wallets", financialWalletsService);
export const financialCategories = makeHooks<FinancialCategory>("financial_categories", financialCategoriesService);
export const financialPaymentRules = makeHooks<FinancialPaymentRule>("financial_payment_rules", financialPaymentRulesService);
export const financialTransactions = makeHooks<FinancialTransaction>("financial_transactions", financialTransactionsService);
export const financialInstallments = makeHooks<FinancialInstallment>("financial_installments", financialInstallmentsService);
export const financialProduction = makeHooks<FinancialProductionRecord>("financial_production_records", financialProductionService);
export const financialPaymentRequests = makeHooks<FinancialPaymentRequest>("financial_payment_requests", financialPaymentRequestsService);
export const financialCashFlow = makeHooks<FinancialCashFlow>("financial_cash_flow", financialCashFlowService);
export const financialReports = makeHooks<FinancialReport>("financial_reports", financialReportsService);
