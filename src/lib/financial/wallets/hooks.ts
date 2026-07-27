import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userWalletMovementsService, userWalletsService } from "./services";
import type { NewUserWalletMovement, UserWallet, UserWalletMovement } from "./types";

const WALLETS_KEY = ["user_wallets"] as const;
const MOVS_KEY = ["user_wallet_movements"] as const;

export function useUserWallet(walletId: string | null | undefined) {
  return useQuery<UserWallet | null>({
    queryKey: [...WALLETS_KEY, "one", walletId],
    queryFn: () => (walletId ? userWalletsService.get(walletId) : Promise.resolve(null)),
    enabled: !!walletId,
  });
}

export function useUserWalletByUser(userId: string | null | undefined, clinicId: string | null | undefined) {
  return useQuery<UserWallet | null>({
    queryKey: [...WALLETS_KEY, "byUser", userId, clinicId],
    queryFn: () =>
      userId && clinicId ? userWalletsService.getByUser(userId, clinicId) : Promise.resolve(null),
    enabled: !!userId && !!clinicId,
  });
}

export function useClinicUserWallets(clinicId: string | null | undefined) {
  return useQuery<UserWallet[]>({
    queryKey: [...WALLETS_KEY, "byClinic", clinicId],
    queryFn: () => (clinicId ? userWalletsService.listByClinic(clinicId) : Promise.resolve([])),
    enabled: !!clinicId,
  });
}

export function useEnsureUserWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => userWalletsService.ensure(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLETS_KEY }),
  });
}

export function useUserWalletMovements(
  walletId: string | null | undefined,
  opts: { limit?: number; status?: string; type?: string } = {},
) {
  return useQuery<UserWalletMovement[]>({
    queryKey: [...MOVS_KEY, walletId, opts],
    queryFn: () => (walletId ? userWalletMovementsService.list(walletId, opts) : Promise.resolve([])),
    enabled: !!walletId,
  });
}

export function useCreateWalletMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewUserWalletMovement) => userWalletMovementsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WALLETS_KEY });
      qc.invalidateQueries({ queryKey: MOVS_KEY });
    },
  });
}

export function useTransferWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      fromWalletId: string;
      toWalletId: string;
      amount: number;
      description?: string;
      reference?: string;
    }) =>
      userWalletMovementsService.transfer(
        v.fromWalletId,
        v.toWalletId,
        v.amount,
        v.description,
        v.reference,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WALLETS_KEY });
      qc.invalidateQueries({ queryKey: MOVS_KEY });
    },
  });
}
