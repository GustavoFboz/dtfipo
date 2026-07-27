// Carteira Profissional — banco interno por usuário/empresa.

export type WalletBalanceBucket = "available" | "pending" | "blocked" | "paid" | "future";

export type UserWalletMovementType =
  | "credit"
  | "debit"
  | "transfer_in"
  | "transfer_out"
  | "advance"
  | "discount"
  | "bonus"
  | "retention"
  | "adjustment"
  | "reversal";

export type UserWalletMovementStatus =
  | "pending"
  | "confirmed"
  | "blocked"
  | "paid"
  | "scheduled"
  | "canceled"
  | "reversed";

export type UserWalletMovementDirection = "in" | "out";

export type UserWallet = {
  id: string;
  clinic_id: string;
  user_id: string;
  currency: string;
  available_balance: number;
  pending_balance: number;
  blocked_balance: number;
  paid_balance: number;
  future_balance: number;
  is_active: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserWalletMovement = {
  id: string;
  clinic_id: string;
  wallet_id: string;
  user_id: string;
  type: UserWalletMovementType;
  direction: UserWalletMovementDirection;
  status: UserWalletMovementStatus;
  balance_bucket: WalletBalanceBucket;
  amount: number;
  currency: string;
  balance_before: number;
  balance_after: number;
  source: string | null;
  source_id: string | null;
  reference: string | null;
  transaction_id: string | null;
  case_id: string | null;
  related_wallet_id: string | null;
  reversed_by: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewUserWalletMovement = {
  wallet_id: string;
  type: UserWalletMovementType;
  direction: UserWalletMovementDirection;
  status?: UserWalletMovementStatus;
  balance_bucket: WalletBalanceBucket;
  amount: number;
  currency?: string;
  source?: string | null;
  source_id?: string | null;
  reference?: string | null;
  transaction_id?: string | null;
  case_id?: string | null;
  related_wallet_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
};
