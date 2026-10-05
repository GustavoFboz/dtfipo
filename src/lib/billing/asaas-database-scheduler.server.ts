import { z } from "zod";
import { isProductionWorkerAuthorized } from "./asaas-production-preflight.server";
import { loadAsaasConfig, loadAsaasProductionPreflightSecrets, loadAsaasWorkerToken } from "./asaas.server";
import type { AsaasProviderEnvironment } from "./asaas-contract";

export const DATABASE_SCHEDULER_CONTRACT = "dentalflow-database-scheduler-v1";
const cadence = "1-59/5 * * * *";
const environmentSchema = z.enum(["sandbox", "production"]);
const jobId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const registrationSchema = z.object({ provider_environment: environmentSchema,
  scheduled: z.literal(true), cron_job_id: jobId, schedule: z.literal(cadence) });
const statusSchema = z.object({ provider_environment: environmentSchema, enabled: z.boolean(),
  cron_job_id: jobId, cron_active: z.boolean(), schedule: z.literal(cadence).nullable(),
  configured_at: z.string().datetime({ offset: true }), last_dispatched_at: z.string().datetime({ offset: true }).nullable(),
  last_response_http_status: z.number().int().min(100).max(599).nullable(), last_response_timed_out: z.boolean().nullable() });
type Dependencies = {
  source?: Record<string, string | undefined>;
  now?: () => number;
  configure?: (environment: AsaasProviderEnvironment, workerToken: string, signal: AbortSignal) => Promise<unknown>;
  readStatus?: (environment: AsaasProviderEnvironment, signal: AbortSignal) => Promise<unknown>;
  verifyIsolation?: (signal: AbortSignal) => Promise<boolean>;
};
function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** No rows or credentials are returned. A managed grant is safe for this
 * scheduler only if PostgREST refuses the entire net schema, even to backend
 * credentials. A normal 200/404/401 is never evidence of schema isolation. */
export async function verifyNetSchemaIsolation(source: Record<string, string | undefined>, signal: AbortSignal,
  transport: typeof fetch = fetch): Promise<boolean> {
  const url = new URL(source.SUPABASE_URL ?? "");
  const key = source.SUPABASE_SERVICE_ROLE_KEY;
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || !key || key.length < 32)
    return false;
  url.pathname = "/rest/v1/http_request_queue";
  url.search = "?select=id&limit=0";
  const headers = new Headers({ apikey: key, "Accept-Profile": "net" });
  if (!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_")) headers.set("Authorization", `Bearer ${key}`);
  const response = await transport(url, { method: "GET", headers, signal, redirect: "manual" });
  if (response.status !== 406) { await response.body?.cancel(); return false; }
  const value: unknown = await response.json();
  return typeof value === "object" && value !== null && "code" in value && value.code === "PGRST106";
}

/** Private operator bootstrap/status. POST copies the current worker credential
 * to Vault and registers the fixed cadence; it never invokes a worker immediately.
 * The caller cannot choose a token, destination, schedule or inactive environment. */
export async function manageAsaasDatabaseScheduler(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ available: false }, 405);
  const source = dependencies.source ?? process.env;
  if (!isProductionWorkerAuthorized(request, source)) return json({ available: false }, 401);
  let environment: AsaasProviderEnvironment;
  let workerToken: string;
  try {
    loadAsaasProductionPreflightSecrets(source);
    environment = loadAsaasConfig(source).environment;
    workerToken = loadAsaasWorkerToken(source);
  } catch { return json({ available: false, code: "DATABASE_SCHEDULER_CONFIGURATION_FAILED" }, 503); }

  if (request.method === "POST") {
    try {
      const text = await request.text();
      if (Buffer.byteLength(text) > 512) return json({ available: false }, 413);
      const parsed = z.object({ expected_environment: environmentSchema }).strict().safeParse(JSON.parse(text));
      if (!parsed.success) return json({ available: false }, 400);
      if (parsed.data.expected_environment !== environment) return json({ available: false, code: "ENVIRONMENT_MISMATCH" }, 409);
    } catch { return json({ available: false }, 400); }
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = async () => {
      let value: unknown;
      if (request.method === "POST") {
        const isolated = await (dependencies.verifyIsolation?.(controller.signal) ?? verifyNetSchemaIsolation(source, controller.signal));
        if (!isolated) throw new Error("NET_SCHEMA_EXPOSED");
        if (dependencies.configure) value = await dependencies.configure(environment, workerToken, controller.signal);
        else {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("billing_configure_database_scheduler", {
            p_environment: environment, p_worker_token: workerToken,
          }).abortSignal(controller.signal);
          if (error) throw error;
          value = data;
        }
        const parsed = registrationSchema.safeParse(value);
        if (!parsed.success || parsed.data.provider_environment !== environment) throw new Error("INVALID_REGISTRATION");
        return json({ available: true, contract: DATABASE_SCHEDULER_CONTRACT, environment,
          checked_at: new Date((dependencies.now ?? Date.now)()).toISOString(), scheduler: parsed.data,
          immediate_worker_invoked: false, api_isolation_verified: true }, 200);
      }
      if (dependencies.readStatus) value = await dependencies.readStatus(environment, controller.signal);
      else {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("billing_database_scheduler_status", { p_environment: environment })
          .abortSignal(controller.signal);
        if (error) throw error;
        value = data;
      }
      const parsed = statusSchema.nullable().safeParse(value);
      if (!parsed.success || (parsed.data && parsed.data.provider_environment !== environment)) throw new Error("INVALID_STATUS");
      return json({ available: true, contract: DATABASE_SCHEDULER_CONTRACT, environment,
        checked_at: new Date((dependencies.now ?? Date.now)()).toISOString(), scheduler: parsed.data,
        immediate_worker_invoked: false }, 200);
    };
    return await Promise.race([run(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("TIMEOUT")); }, 8_000);
    })]);
  } catch {
    return json({ available: false, code: "DATABASE_SCHEDULER_UNAVAILABLE" }, 503);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}
