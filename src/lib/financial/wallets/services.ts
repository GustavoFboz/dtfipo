// Serviço da Carteira Profissional.

import { supabase } from "@/integrations/supabase/client";
import type {
  NewUserWalletMovement,
  UserWallet,
  UserWalletMovement,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const userWalletsService = {
  /** Garante que o usuário tenha uma carteira e retorna o id. */
  async ensure(userId: string): Promise<string> {
    const { data, error } = await db.rpc("ensure_user_wallet", { _user_id: userId });
    if (error) throw error;
    return data as string;
  },

  async get(walletId: string): Promise<UserWallet | null> {
    const { data, error } = await db
      .from("user_wallets")
      .select("*")
      .eq("id", walletId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as UserWallet | null;
  },

  async getByUser(userId: string, clinicId: string): Promise<UserWallet | null> {
    const { data, error } = await db
      .from("user_wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as UserWallet | null;
  },

  async listByClinic(clinicId: string): Promise<UserWallet[]> {
    const { data, error } = await db
      .from("user_wallets")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as UserWallet[];
  },

  async updateSettings(
    walletId: string,
    patch: Partial<Pick<UserWallet, "is_active" | "notes" | "metadata" | "currency">>,
  ): Promise<UserWallet> {
    const { data, error } = await db
      .from("user_wallets")
      .update(patch)
      .eq("id", walletId)
      .select("*")
      .single();
    if (error) throw error;
    return data as UserWallet;
  },
};

export const userWalletMovementsService = {
  async list(
    walletId: string,
    opts: { limit?: number; status?: string; type?: string } = {},
  ): Promise<UserWalletMovement[]> {
    let q = db
      .from("user_wallet_movements")
      .select("*")
      .eq("wallet_id", walletId)
      .order("occurred_at", { ascending: false });
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.type) q = q.eq("type", opts.type);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as UserWalletMovement[];
  },

  /**
   * Insere um movimento. O trigger `apply_user_wallet_movement` grava
   * balance_before/balance_after e atualiza a carteira automaticamente.
   */
  async create(input: NewUserWalletMovement): Promise<UserWalletMovement> {
    const { data, error } = await db
      .from("user_wallet_movements")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data as UserWalletMovement;
  },

  /** Transferência entre carteiras (mesma empresa). */
  async transfer(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    description?: string,
    reference?: string,
  ): Promise<{ success: boolean; out_id?: string; in_id?: string; error?: string }> {
    const { data, error } = await db.rpc("transfer_user_wallet", {
      _from_wallet: fromWalletId,
      _to_wallet: toWalletId,
      _amount: amount,
      _description: description ?? null,
      _reference: reference ?? null,
    });
    if (error) throw error;
    return data as { success: boolean; out_id?: string; in_id?: string; error?: string };
  },

  // Atalhos por tipo — todos criam um movimento normal, o trigger cuida do saldo.
  advance: (walletId: string, amount: number, description?: string) =>
    userWalletMovementsService.create({
      wallet_id: walletId,
      type: "advance",
      direction: "in",
      balance_bucket: "available",
      amount,
      source: "advance",
      description,
    }),

  discount: (walletId: string, amount: number, description?: string) =>
    userWalletMovementsService.create({
      wallet_id: walletId,
      type: "discount",
      direction: "out",
      balance_bucket: "available",
      amount,
      source: "discount",
      description,
    }),

  bonus: (walletId: string, amount: number, description?: string) =>
    userWalletMovementsService.create({
      wallet_id: walletId,
      type: "bonus",
      direction: "in",
      balance_bucket: "available",
      amount,
      source: "bonus",
      description,
    }),

  retention: (walletId: string, amount: number, description?: string) =>
    userWalletMovementsService.create({
      wallet_id: walletId,
      type: "retention",
      direction: "in",
      balance_bucket: "blocked",
      amount,
      source: "retention",
      description,
    }),
};
