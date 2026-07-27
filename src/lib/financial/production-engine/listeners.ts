// Built-in placeholder listeners. They do NOT perform any calculation or
// financial write yet — they exist to prove the pipeline end-to-end and to
// give future modules a wiring point. Each listener returns "skipped" so
// nothing downstream mistakes it for real production.

import type { ProductionEventListener } from "./types";
import { registerProductionListener } from "./dispatcher";

export const professionalRuleListener: ProductionEventListener = {
  name: "professional-rules.calculator",
  handles: ["case_finalized", "case_delivered", "case_paid"],
  handle: async () => ({
    outcome: "skipped",
    message: "professional-rules calculation not implemented yet",
  }),
};

export const walletMovementListener: ProductionEventListener = {
  name: "wallet.movements",
  handles: ["case_paid"],
  handle: async () => ({
    outcome: "skipped",
    message: "wallet movement generation not implemented yet",
  }),
};

export const productionRecordListener: ProductionEventListener = {
  name: "production.records",
  handles: ["case_finalized", "case_delivered"],
  handle: async () => ({
    outcome: "skipped",
    message: "production record generation not implemented yet",
  }),
};

/** Register defaults. Import this module once from the app entry to activate. */
export function registerDefaultProductionListeners() {
  registerProductionListener(professionalRuleListener);
  registerProductionListener(walletMovementListener);
  registerProductionListener(productionRecordListener);
}
