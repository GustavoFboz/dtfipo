import {
  ASAAS_BILLING_CYCLE,
  ASAAS_PROVIDER_ENVIRONMENTS,
  type AsaasProviderEnvironment,
} from "./asaas-contract";

const ASAAS_BASE_URL: Record<AsaasProviderEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]+$/;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]+$/;

export type AsaasBillingType = "UNDEFINED" | "BOLETO" | "CREDIT_CARD" | "PIX";

export type AsaasConfig = {
  environment: AsaasProviderEnvironment;
  baseUrl: string;
  apiKey: string;
  webhookToken: string;
  userAgent: string;
  timeoutMs: number;
  maxGetRetries: number;
  minRequestIntervalMs: number;
};

export type AsaasCustomer = {
  id: string;
  name?: string;
  cpfCnpj?: string;
  externalReference?: string | null;
  deleted?: boolean;
};

export type AsaasSubscription = {
  id: string;
  customer: string;
  billingType?: AsaasBillingType;
  value?: number;
  nextDueDate?: string;
  cycle?: string;
  status?: string;
  externalReference?: string | null;
  deleted?: boolean;
};

export type AsaasPayment = {
  id: string;
  customer: string;
  subscription?: string | null;
  billingType?: AsaasBillingType;
  value?: number;
  dueDate?: string;
  status?: string;
  invoiceUrl?: string;
  externalReference?: string | null;
  deleted?: boolean;
};

export type CreateAsaasCustomer = {
  name: string;
  cpfCnpj: string;
  email: string;
  mobilePhone: string;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  externalReference: string;
};

export type CreateAsaasSubscription = {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: typeof ASAAS_BILLING_CYCLE;
  description: string;
  externalReference: string;
};

type AsaasListResponse<T> = {
  object?: "list";
  hasMore?: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data: T[];
};

type RequestMethod = "GET" | "POST";

type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

type AsaasClientDependencies = {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} inválido.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} deve estar entre ${minimum} e ${maximum}.`);
  }
  return parsed;
}

function requiredSecret(
  source: Record<string, string | undefined>,
  name: string,
  minimumLength: number,
): string {
  const value = source[name]?.trim();
  if (!value || value.length < minimumLength || /[\r\n]/.test(value)) {
    throw new Error(`Configuração segura ausente ou inválida: ${name}.`);
  }
  return value;
}

export function loadAsaasConfig(
  source: Record<string, string | undefined> = process.env,
): AsaasConfig {
  const configuredEnvironment = source.ASAAS_ENVIRONMENT?.trim();
  if (!ASAAS_PROVIDER_ENVIRONMENTS.includes(configuredEnvironment as AsaasProviderEnvironment)) {
    throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou production.");
  }
  const environment = configuredEnvironment as AsaasProviderEnvironment;

  if (environment === "production" && source.ASAAS_PRODUCTION_ENABLED !== "true") {
    throw new Error("Asaas Produção permanece bloqueado até homologação e liberação explícitas.");
  }

  const apiKey = requiredSecret(source, "ASAAS_API_KEY", 16);
  const expectedPrefix = environment === "sandbox" ? "$aact_hmlg_" : "$aact_prod_";
  if (!apiKey.startsWith(expectedPrefix)) {
    throw new Error("ASAAS_API_KEY não pertence ao ASAAS_ENVIRONMENT configurado.");
  }

  const webhookToken = requiredSecret(source, "ASAAS_WEBHOOK_TOKEN", 32);
  const userAgent = requiredSecret(source, "ASAAS_USER_AGENT", 8);
  if (userAgent.length > 160) throw new Error("ASAAS_USER_AGENT excede 160 caracteres.");

  return {
    environment,
    baseUrl: ASAAS_BASE_URL[environment],
    apiKey,
    webhookToken,
    userAgent,
    timeoutMs: parseBoundedInteger(
      source.ASAAS_TIMEOUT_MS,
      10_000,
      1_000,
      30_000,
      "ASAAS_TIMEOUT_MS",
    ),
    maxGetRetries: parseBoundedInteger(
      source.ASAAS_MAX_GET_RETRIES,
      2,
      0,
      4,
      "ASAAS_MAX_GET_RETRIES",
    ),
    minRequestIntervalMs: parseBoundedInteger(
      source.ASAAS_MIN_REQUEST_INTERVAL_MS,
      125,
      0,
      5_000,
      "ASAAS_MIN_REQUEST_INTERVAL_MS",
    ),
  };
}

function redactProviderText(value: unknown): string {
  return String(value ?? "")
    .replace(/\$aact_[A-Za-z0-9_$-]+/g, "[REDACTED_KEY]")
    .replace(/\b\d{6,}\b/g, "[REDACTED_NUMBER]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function responseRetryDelay(response: Response): number | null {
  const rateLimitReset = response.headers.get("RateLimit-Reset");
  if (rateLimitReset && /^\d+$/.test(rateLimitReset.trim())) {
    return Math.min(60_000, Number(rateLimitReset) * 1_000);
  }

  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return null;
  if (/^\d+$/.test(retryAfter.trim())) {
    return Math.min(60_000, Number(retryAfter) * 1_000);
  }
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.min(60_000, Math.max(0, date - Date.now())) : null;
}

function providerErrorDetails(payload: unknown): { code: string; message: string } {
  const fallback = { code: "ASAAS_REQUEST_REJECTED", message: "Requisição rejeitada pelo Asaas." };
  if (!payload || typeof payload !== "object") return fallback;
  const errors = (payload as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || !errors.length || !errors[0] || typeof errors[0] !== "object") {
    return fallback;
  }
  const first = errors[0] as { code?: unknown; description?: unknown };
  return {
    code: redactProviderText(first.code || fallback.code)
      .replace(/[^A-Za-z0-9_.-]/g, "_")
      .slice(0, 80),
    message: redactProviderText(first.description || fallback.message),
  };
}

export class AsaasApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly retryAfterMs: number | null;

  constructor(input: {
    code: string;
    message: string;
    status?: number | null;
    retryable?: boolean;
    ambiguous?: boolean;
    retryAfterMs?: number | null;
  }) {
    super(input.message);
    this.name = "AsaasApiError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
    this.ambiguous = input.ambiguous ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }
}

function validateCustomer(value: unknown): AsaasCustomer {
  if (
    !value ||
    typeof value !== "object" ||
    !CUSTOMER_ID_PATTERN.test(String((value as { id?: unknown }).id ?? ""))
  ) {
    throw new AsaasApiError({
      code: "ASAAS_INVALID_RESPONSE",
      message: "Resposta de cliente inválida.",
    });
  }
  return value as AsaasCustomer;
}

function validateSubscription(value: unknown): AsaasSubscription {
  if (
    !value ||
    typeof value !== "object" ||
    !SUBSCRIPTION_ID_PATTERN.test(String((value as { id?: unknown }).id ?? ""))
  ) {
    throw new AsaasApiError({
      code: "ASAAS_INVALID_RESPONSE",
      message: "Resposta de assinatura inválida.",
    });
  }
  return value as AsaasSubscription;
}

function validatePayment(value: unknown): AsaasPayment {
  if (
    !value ||
    typeof value !== "object" ||
    !PAYMENT_ID_PATTERN.test(String((value as { id?: unknown }).id ?? "")) ||
    !CUSTOMER_ID_PATTERN.test(String((value as { customer?: unknown }).customer ?? ""))
  ) {
    throw new AsaasApiError({
      code: "ASAAS_INVALID_RESPONSE",
      message: "Resposta de cobrança inválida.",
    });
  }
  const subscription = (value as { subscription?: unknown }).subscription;
  if (subscription != null && !SUBSCRIPTION_ID_PATTERN.test(String(subscription))) {
    throw new AsaasApiError({
      code: "ASAAS_INVALID_RESPONSE",
      message: "Assinatura da cobrança inválida.",
    });
  }
  return value as AsaasPayment;
}

export class AsaasClient {
  readonly environment: AsaasProviderEnvironment;
  private readonly config: AsaasConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private requestTail: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private rateLimitedUntil = 0;

  constructor(config: AsaasConfig, dependencies: AsaasClientDependencies = {}) {
    if (config.baseUrl !== ASAAS_BASE_URL[config.environment]) {
      throw new Error("URL base Asaas não corresponde ao ambiente permitido.");
    }
    this.config = config;
    this.environment = config.environment;
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.sleepImpl = dependencies.sleep ?? sleep;
    this.random = dependencies.random ?? Math.random;
    this.now = dependencies.now ?? Date.now;
  }

  private async withRateGate<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.requestTail;
    let release!: () => void;
    this.requestTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const waitUntil = Math.max(this.nextRequestAt, this.rateLimitedUntil);
    const waitMs = Math.max(0, waitUntil - this.now());
    if (waitMs > 0) await this.sleepImpl(waitMs);

    try {
      return await task();
    } finally {
      this.nextRequestAt = this.now() + this.config.minRequestIntervalMs;
      release();
    }
  }

  private buildUrl(pathname: string, query?: RequestOptions["query"]): URL {
    if (!pathname.startsWith("/") || pathname.includes("..")) {
      throw new Error("Caminho Asaas inválido.");
    }
    const url = new URL(`${this.config.baseUrl}${pathname}`);
    if (`${url.origin}/v3` !== this.config.baseUrl) {
      throw new Error("Destino Asaas fora da lista permitida.");
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  private async requestOnce<T>(
    method: RequestMethod,
    pathname: string,
    options: RequestOptions,
  ): Promise<T> {
    return this.withRateGate(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const url = this.buildUrl(pathname, options.query);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": this.config.userAgent,
            access_token: this.config.apiKey,
          },
          body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = controller.signal.aborted;
        throw new AsaasApiError({
          code: timedOut ? "ASAAS_TIMEOUT" : "ASAAS_NETWORK_ERROR",
          message: timedOut
            ? "Tempo limite da API Asaas excedido."
            : "Falha de rede ao acessar a API Asaas.",
          retryable: true,
          ambiguous: method === "POST",
        });
      } finally {
        clearTimeout(timeout);
      }

      const retryAfterMs = responseRetryDelay(response);
      if (response.headers.get("RateLimit-Remaining") === "0" && retryAfterMs !== null) {
        this.rateLimitedUntil = Math.max(this.rateLimitedUntil, this.now() + retryAfterMs);
      }

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const details = providerErrorDetails(payload);
        const retryable = response.status === 429 || response.status >= 500;
        throw new AsaasApiError({
          code: details.code,
          message: details.message,
          status: response.status,
          retryable,
          ambiguous: method === "POST" && response.status >= 500,
          retryAfterMs,
        });
      }

      if (payload === null) {
        throw new AsaasApiError({
          code: "ASAAS_EMPTY_RESPONSE",
          message: "Resposta vazia da API Asaas.",
        });
      }
      return payload as T;
    });
  }

  private async request<T>(
    method: RequestMethod,
    pathname: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const attempts = method === "GET" ? this.config.maxGetRetries + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.requestOnce<T>(method, pathname, options);
      } catch (error) {
        lastError = error;
        if (!(error instanceof AsaasApiError) || !error.retryable || attempt + 1 >= attempts)
          throw error;
        const exponential = Math.min(10_000, 400 * 2 ** attempt);
        const jitter = Math.floor(exponential * 0.2 * this.random());
        await this.sleepImpl(error.retryAfterMs ?? exponential + jitter);
      }
    }
    throw lastError;
  }

  async findCustomersByExternalReference(externalReference: string): Promise<AsaasCustomer[]> {
    const response = await this.request<AsaasListResponse<unknown>>("GET", "/customers", {
      query: { externalReference, limit: 10 },
    });
    if (!Array.isArray(response.data)) {
      throw new AsaasApiError({
        code: "ASAAS_INVALID_RESPONSE",
        message: "Lista de clientes inválida.",
      });
    }
    return response.data
      .map(validateCustomer)
      .filter((customer) => !customer.deleted && customer.externalReference === externalReference);
  }

  async createCustomer(input: CreateAsaasCustomer): Promise<AsaasCustomer> {
    const response = await this.request<unknown>("POST", "/customers", { body: input });
    return validateCustomer(response);
  }

  async findSubscriptionsByExternalReference(
    externalReference: string,
  ): Promise<AsaasSubscription[]> {
    const response = await this.request<AsaasListResponse<unknown>>("GET", "/subscriptions", {
      query: { externalReference, includeDeleted: false, limit: 10 },
    });
    if (!Array.isArray(response.data)) {
      throw new AsaasApiError({
        code: "ASAAS_INVALID_RESPONSE",
        message: "Lista de assinaturas inválida.",
      });
    }
    return response.data
      .map(validateSubscription)
      .filter(
        (subscription) =>
          !subscription.deleted && subscription.externalReference === externalReference,
      );
  }

  async createMonthlySubscription(input: CreateAsaasSubscription): Promise<AsaasSubscription> {
    if (input.cycle !== ASAAS_BILLING_CYCLE) {
      throw new Error("O DentalFlow aceita apenas assinaturas mensais nesta etapa.");
    }
    const response = await this.request<unknown>("POST", "/subscriptions", { body: input });
    return validateSubscription(response);
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    if (!SUBSCRIPTION_ID_PATTERN.test(subscriptionId)) {
      throw new Error("Assinatura Asaas inválida.");
    }
    const response = await this.request<AsaasListResponse<unknown>>(
      "GET",
      `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    );
    if (!Array.isArray(response.data)) {
      throw new AsaasApiError({
        code: "ASAAS_INVALID_RESPONSE",
        message: "Lista de cobranças inválida.",
      });
    }
    return response.data
      .map(validatePayment)
      .filter((payment) => !payment.deleted && payment.subscription === subscriptionId);
  }

  async getPayment(paymentId: string): Promise<AsaasPayment> {
    if (!PAYMENT_ID_PATTERN.test(paymentId)) throw new Error("Cobrança Asaas inválida.");
    return validatePayment(
      await this.request<unknown>("GET", `/payments/${encodeURIComponent(paymentId)}`),
    );
  }

  validatePaymentUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AsaasApiError({
        code: "ASAAS_INVALID_PAYMENT_URL",
        message: "URL de pagamento inválida.",
      });
    }

    const expectedHost = this.environment === "sandbox" ? "sandbox.asaas.com" : "www.asaas.com";
    if (
      url.protocol !== "https:" ||
      url.hostname !== expectedHost ||
      !/^\/i\/[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(`${url.pathname}${url.search}${url.hash}`)
    ) {
      throw new AsaasApiError({
        code: "ASAAS_INVALID_PAYMENT_URL",
        message: "URL de pagamento fora do ambiente permitido.",
      });
    }
    return url.toString();
  }
}
