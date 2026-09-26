import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const name = "20260926190000_saas_asaas_webhook_stage04.sql";
const migration = read(`supabase/migrations/${name}`);
const manifest = JSON.parse(read("public/restore/migrations.json"));
const backend = read("src/lib/billing/asaas-webhook.server.ts");
const selfHeal = read("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql");
const types = read("src/integrations/supabase/types.ts");
check(read(`public/restore/migrations/${name}`) === migration, "Stage 04 restore copy diverged.");
check(
  manifest.indexOf(name) > manifest.indexOf("20260921210000_saas_asaas_checkout_stage03.sql"),
  "Stage 04 must follow checkout.",
);
check(manifest.at(-1)?.includes("self_heal"), "Self-heal must remain last.");
for (const name of [
  "billing_receive_asaas_event",
  "billing_claim_asaas_events",
  "billing_finish_asaas_event",
  "billing_apply_asaas_initial_payment",
]) {
  check(
    migration.includes(name) && selfHeal.includes(name) && types.includes(name),
    `Private ${name} contract is incomplete.`,
  );
}
check(migration.includes("for update skip locked"), "Worker leases must be atomic.");
check(
  migration.includes("provider_payment_id = p_payment_id"),
  "Payment must match checkout identity.",
);
check(
  migration.includes("v_sub.external_customer_id <> p_customer_id"),
  "Customer must match the company.",
);
check(
  migration.includes("v_sub.external_subscription_id <> p_subscription_id"),
  "Subscription must match the company.",
);
check(
  backend.includes("timingSafeEqual") && backend.includes("asaas-access-token"),
  "Webhook authentication missing.",
);
check(
  backend.includes("getPayment") && backend.includes("BILLING_WORKER_TOKEN"),
  "Provider reconciliation/worker authorization missing.",
);
for (const path of ["asaas-webhook", "asaas-worker"]) {
  const route = read(`src/routes/api/billing/${path}.ts`);
  check(
    route.includes("await import(") && !route.includes("asaas.server.ts"),
    `${path} must import backend code dynamically.`,
  );
}
console.log("Stage 04 webhook contract verified.");
