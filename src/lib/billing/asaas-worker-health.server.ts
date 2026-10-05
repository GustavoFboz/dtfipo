import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadAsaasConfig, loadAsaasWorkerToken } from "./asaas.server";
import type { AsaasProviderEnvironment } from "./asaas-contract";

export const WORKER_HEALTH_CONTRACT = "dentalflow-worker-health-v1";
const timestamp = z.string().datetime({ offset: true });
const healthSchema = z.object({ status: z.enum(["running", "ok", "review", "failed"]),
  started_at: timestamp, finished_at: timestamp.nullable(), last_healthy_at: timestamp.nullable(),
}).strict().refine((h) => h.status === "running" ? h.finished_at === null
  : h.finished_at !== null && Date.parse(h.finished_at) >= Date.parse(h.started_at));
type HealthDependencies = {
  workerToken: string;
  environment: AsaasProviderEnvironment;
  readHealth: (signal: AbortSignal) => Promise<unknown>;
  now?: () => number;
};
function json(body: object, status: number) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  } });
}
function authorized(request: Request, expected: string) {
  const value = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!value || expected.length < 32 || /[\r\n]/.test(expected)) return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Private GET probe. Reads telemetry only; never claims events or calls Asaas. */
export async function inspectAsaasWorker(request: Request, dependencies?: HealthDependencies): Promise<Response> {
  if (request.method !== "GET") return json({ available: false }, 405);
  let token: string;
  try { token = dependencies?.workerToken ?? loadAsaasWorkerToken(); }
  catch { return json({ available: false }, 401); }
  if (!authorized(request, token)) return json({ available: false }, 401);
  let deps: HealthDependencies;
  try {
    if (dependencies) deps = dependencies;
    else {
      // Configuration validation is local and performs no provider request.
      const config = loadAsaasConfig();
      deps = { environment: config.environment, workerToken: token, readHealth: async (signal) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("billing_worker_health")
          .select("status,started_at,finished_at,last_healthy_at").eq("provider_environment",config.environment)
          .abortSignal(signal).maybeSingle();
        if (error) throw error;
        return data;
      } };
    }
  } catch {
    return json({ available: false, code: "CONFIGURATION_FAILED" }, 503);
  }
  const expectedEnvironment = request.headers.get("x-billing-environment");
  if (expectedEnvironment !== null && expectedEnvironment !== deps.environment)
    return json({ available: false, code: "ENVIRONMENT_MISMATCH" }, 409);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([deps.readHealth(controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error("HEALTH_READ_TIMEOUT"));
      }, 3_000); })]);
    const parsed = healthSchema.nullable().safeParse(raw);
    if (!parsed.success) throw new Error("HEALTH_READ_FAILED");
    const now = (deps.now ?? Date.now)();
    const worker = parsed.data ? { ...parsed.data,
      started_age_seconds: Math.max(0,Math.floor((now-Date.parse(parsed.data.started_at))/1000)),
      healthy_age_seconds: parsed.data.last_healthy_at === null ? null
        : Math.max(0,Math.floor((now-Date.parse(parsed.data.last_healthy_at))/1000)),
    } : null;
    return json({ available: true, contract: WORKER_HEALTH_CONTRACT, environment: deps.environment,
      checked_at: new Date(now).toISOString(), worker }, 200);
  } catch (error) {
    const code = error instanceof Error && error.message === "HEALTH_READ_TIMEOUT" ? "HEALTH_READ_TIMEOUT" : "HEALTH_READ_FAILED";
    return json({ available: false, code }, 503);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}
