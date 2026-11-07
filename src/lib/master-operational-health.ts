import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { withDesktopCloudTimeout } from "@/lib/desktop-cloud";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "@/lib/auth/master-session";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().datetime({ offset: true });
const counters = z.object({ processed: count, ignored: count, failed: count, workerReview: count,
  suspended: count, recoveryQueued: count, graceReview: count, reconciliationScanned: count,
  reconciliationQueued: count, reconciliationReview: count }).strict();
const worker = z.object({ started_at: date, finished_at: date.nullable(), last_healthy_at: date.nullable(),
  status: z.enum(["running", "ok", "review", "failed"]), counters: counters.partial() }).strict().refine((w) =>
  w.status === "running" ? w.finished_at === null && Object.keys(w.counters).length === 0
    : w.finished_at !== null && Date.parse(w.finished_at) >= Date.parse(w.started_at)
      && counters.safeParse(w.counters).success, { message: "Inconsistent worker record" });
const environment = z.object({ environment: z.enum(["sandbox", "production"]), worker: worker.nullable(),
  queue: z.object({ waiting: count, processing: count, failed: count, dead_letter: count,
    expired_leases: count, late_due: count, oldest_due_at: date.nullable() }).strict(),
  checkout: z.object({ failed_24h: count, uncertain: count, expired_leases: count }).strict(),
  subscriptions: z.object({ linked: count, reconciliation_late: count, expired_grace: count,
    paid_period_without_ledger: count }).strict(),
}).strict();
const snapshot = z.object({ generated_at: date, environments: z.array(environment).length(2),
  storage: z.object({ reserved: count, reserved_bytes: count, reserved_over_24h: count }).strict(),
}).strict().refine((s) => new Set(s.environments.map((e) => e.environment)).size === 2, { message: "Duplicate environment" });
export type MasterOperationalHealth = z.infer<typeof snapshot>;
export type OperationalEnvironment = z.infer<typeof environment>;
export const masterOperationalHealthKey = (scope: MasterSessionScope) =>
  ["master_operational_health", scope.ownerId, scope.sessionId, scope.generation] as const;

// Operational administration is online on every shell. It never reads/writes
// a clinical snapshot, device entitlement or offline outbox.
export async function fetchMasterOperationalHealth(scope: MasterSessionScope, isCurrent: MasterSessionCheck,
  signal?: AbortSignal): Promise<MasterOperationalHealth> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("MASTER_HEALTH_OFFLINE");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const data = await withDesktopCloudTimeout("acompanhamento operacional", async () => {
      signal?.throwIfAborted();
      const session = await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      const verified = await supabase.auth.getUser(session.access_token);
      if (verified.error || verified.data.user?.id !== scope.ownerId) throw new Error("MASTER_SESSION_CHANGED");
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      const { data, error } = await supabase.rpc("platform_master_operational_health")
        .setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(controller.signal);
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      if (error) throw error;
      return data;
    });
    const parsed = snapshot.safeParse(data);
    if (!parsed.success) throw new Error("MASTER_HEALTH_INVALID_RESPONSE");
    return parsed.data;
  } finally { controller.abort(); signal?.removeEventListener("abort", abort); }
}

export function operationalAlerts(e: OperationalEnvironment, generatedAt: string): string[] {
  const alerts: string[] = [];
  const expected = e.subscriptions.linked + e.queue.waiting + e.queue.processing + e.queue.dead_letter > 0;
  const now = Date.parse(generatedAt);
  if (expected && (!e.worker?.last_healthy_at || now-Date.parse(e.worker.last_healthy_at) >= 15*60_000))
    alerts.push("Sem execução concluída sem erros nos últimos 15 minutos. Confira o agendamento e os registros do worker.");
  if (e.worker?.status === "running" && now-Date.parse(e.worker.started_at) >= 5*60_000)
    alerts.push("Execução iniciada há mais de 5 minutos sem conclusão registrada.");
  if (e.worker?.status === "review" || e.worker?.status === "failed") alerts.push("A última execução exige revisão dos registros e dos eventos.");
  if (e.queue.dead_letter) alerts.push(`${e.queue.dead_letter} evento(s) aguardando revisão manual antes de replay.`);
  if (e.queue.failed) alerts.push(`${e.queue.failed} evento(s) com falha aguardando nova tentativa.`);
  if (e.queue.late_due || e.queue.expired_leases) alerts.push("Há eventos atrasados ou com prazo de processamento expirado.");
  if (e.checkout.uncertain || e.checkout.expired_leases) alerts.push("Há criação de cobrança incerta. Confira o recurso existente antes de tentar novamente.");
  if (e.checkout.failed_24h) alerts.push("Há falhas de criação de cobrança nas últimas 24 horas.");
  if (e.subscriptions.reconciliation_late) alerts.push("Há assinaturas sem tentativa de reconciliação nas últimas 2 horas.");
  if (e.subscriptions.expired_grace) alerts.push("Há carência vencida aguardando conferência no provedor.");
  if (e.subscriptions.paid_period_without_ledger) alerts.push("Há período ativo sem pagamento correspondente no histórico local. Revise antes de alterar o acesso.");
  return alerts;
}

export function friendlyOperationalHealthError(): string {
  return "Acompanhamento indisponível. Conecte-se à internet com sua conta Master e atualize os indicadores.";
}
