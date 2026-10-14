import {
  ASAAS_BILLING_CYCLE,
  ASAAS_PROVIDER,
  type AsaasProviderEnvironment,
} from "./asaas-contract";
import {
  AsaasApiError,
  AsaasClient,
  loadAsaasConfig,
  type AsaasBillingType,
  type AsaasCustomer,
  type AsaasSubscription,
} from "./asaas.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ProviderOperationType = "customer_ensure" | "subscription_create";
type ProviderOperationFinalStatus = "succeeded" | "uncertain" | "failed";

export type AsaasProvisioningContext = {
  subscription_id: string;
  clinic_id: string;
  clinic_name: string;
  plan_code: string;
  plan_name: string;
  monthly_price_cents: number;
  currency: string;
  billing_day: number | null;
  provider_environment: AsaasProviderEnvironment;
  provider_customer_id: string | null;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  legal_name: string;
  tax_id_digits: string;
  billing_email: string;
  billing_phone_digits: string;
  postal_code_digits: string;
  address_line: string;
  address_number: string;
  address_complement: string | null;
  district: string;
  city: string;
  state: string;
  country_code: "BR";
};

export type ProviderOperationClaim = {
  operation_id: string;
  claimed: boolean;
  status: "in_progress" | "succeeded" | "uncertain" | "failed";
  lease_token?: string;
  provider_resource_id?: string;
  busy?: boolean;
  manual_review?: boolean;
  retry_after_seconds?: number;
  attempt_count: number;
};

export type AsaasProvisioningStore = {
  loadContext(input: {
    subscriptionId: string;
    actorUserId: string;
    environment: AsaasProviderEnvironment;
  }): Promise<AsaasProvisioningContext>;
  claimOperation(input: {
    environment: AsaasProviderEnvironment;
    operationType: ProviderOperationType;
    idempotencyKey: string;
    externalReference: string;
  }): Promise<ProviderOperationClaim>;
  finishOperation(input: {
    operationId: string;
    leaseToken: string;
    status: ProviderOperationFinalStatus;
    providerResourceId?: string;
    errorCode?: string;
  }): Promise<void>;
  bindCustomer(input: {
    clinicId: string;
    environment: AsaasProviderEnvironment;
    customerId: string;
  }): Promise<void>;
  bindSubscription(input: {
    subscriptionId: string;
    environment: AsaasProviderEnvironment;
    customerId: string;
    providerSubscriptionId: string;
  }): Promise<void>;
};

export type ProvisionAsaasSubscriptionInput = {
  subscriptionId: string;
  actorUserId: string;
  nextDueDate: string;
  billingType?: AsaasBillingType;
};

export type ProvisionAsaasSubscriptionResult = {
  environment: AsaasProviderEnvironment;
  customerId: string;
  subscriptionId: string;
  customerReused: boolean;
  subscriptionReused: boolean;
  paymentConfirmed: false;
};

type ProvisioningDependencies = {
  client: Pick<
    AsaasClient,
    | "environment"
    | "findCustomersByExternalReference"
    | "createCustomer"
    | "findSubscriptionsByExternalReference"
    | "createMonthlySubscription"
  >;
  store: AsaasProvisioningStore;
  sleep?: (milliseconds: number) => Promise<void>;
};

type EnsuredResource = { id: string; reused: boolean };

export class AsaasProvisioningError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(code: string, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "AsaasProvisioningError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function customerExternalReference(clinicId: string): string {
  if (!UUID_PATTERN.test(clinicId))
    throw new AsaasProvisioningError("INVALID_CLINIC_ID", "Empresa inválida.");
  return `dentalflow:company:${clinicId}`;
}

function subscriptionExternalReference(subscriptionId: string): string {
  if (!UUID_PATTERN.test(subscriptionId)) {
    throw new AsaasProvisioningError("INVALID_SUBSCRIPTION_ID", "Assinatura interna inválida.");
  }
  return `dentalflow:subscription:${subscriptionId}`;
}

function validateNextDueDate(value: string): string {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new AsaasProvisioningError("INVALID_DUE_DATE", "Data de vencimento inválida.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AsaasProvisioningError("INVALID_DUE_DATE", "Data de vencimento inválida.");
  }
  return value;
}

function validateContext(
  context: AsaasProvisioningContext,
  environment: AsaasProviderEnvironment,
): void {
  if (
    !UUID_PATTERN.test(context.subscription_id) ||
    !UUID_PATTERN.test(context.clinic_id) ||
    context.provider_environment !== environment ||
    context.country_code !== "BR" ||
    context.currency !== "BRL" ||
    !Number.isSafeInteger(context.monthly_price_cents) ||
    context.monthly_price_cents <= 0 ||
    !/^\d{11}(\d{3})?$/.test(context.tax_id_digits) ||
    !/^\d{10,13}$/.test(context.billing_phone_digits) ||
    !/^\d{8}$/.test(context.postal_code_digits)
  ) {
    throw new AsaasProvisioningError(
      "INVALID_PROVISIONING_CONTEXT",
      "Contrato de cobrança incompleto ou inconsistente.",
    );
  }
}

function operationErrorCode(error: unknown): string {
  if (error instanceof AsaasProvisioningError || error instanceof AsaasApiError)
    return error.code.slice(0, 80);
  return "INTERNAL_PROVISIONING_ERROR";
}

async function finishClaim(
  store: AsaasProvisioningStore,
  claim: ProviderOperationClaim,
  status: ProviderOperationFinalStatus,
  providerResourceId?: string,
  errorCode?: string,
): Promise<void> {
  if (!claim.lease_token) {
    throw new AsaasProvisioningError(
      "INVALID_OPERATION_LEASE",
      "Lease da operação financeira inválido.",
    );
  }
  await store.finishOperation({
    operationId: claim.operation_id,
    leaseToken: claim.lease_token,
    status,
    providerResourceId,
    errorCode,
  });
}

function requireClaim(claim: ProviderOperationClaim): void {
  if (claim.claimed && claim.lease_token) return;
  if (claim.status === "succeeded" && claim.provider_resource_id) return;
  if (claim.status === "uncertain" || claim.manual_review) {
    throw new AsaasProvisioningError(
      "PROVIDER_OPERATION_REVIEW_REQUIRED",
      "A operação financeira anterior teve resultado incerto e exige reconciliação manual.",
    );
  }
  throw new AsaasProvisioningError(
    "PROVIDER_OPERATION_BUSY",
    "Outra tentativa de cobrança ainda está em processamento.",
    claim.retry_after_seconds ?? 2,
  );
}

function oneCustomer(resources: AsaasCustomer[]): AsaasCustomer | null {
  if (resources.length > 1) {
    throw new AsaasProvisioningError(
      "DUPLICATE_ASAAS_CUSTOMER",
      "Mais de um cliente Asaas usa a mesma referência. Revisão manual obrigatória.",
    );
  }
  return resources[0] ?? null;
}

function oneSubscription(
  resources: AsaasSubscription[],
  expectedCustomerId: string,
): AsaasSubscription | null {
  if (resources.length > 1) {
    throw new AsaasProvisioningError(
      "DUPLICATE_ASAAS_SUBSCRIPTION",
      "Mais de uma assinatura Asaas usa a mesma referência. Revisão manual obrigatória.",
    );
  }
  const subscription = resources[0] ?? null;
  if (subscription && subscription.customer !== expectedCustomerId) {
    throw new AsaasProvisioningError(
      "ASAAS_SUBSCRIPTION_CUSTOMER_CONFLICT",
      "A assinatura Asaas localizada pertence a outro cliente.",
    );
  }
  return subscription;
}

async function reconcileCustomerAfterAmbiguousWrite(
  externalReference: string,
  dependencies: ProvisioningDependencies,
): Promise<AsaasCustomer | null> {
  const wait = dependencies.sleep ?? sleep;
  for (const delay of [250, 750, 1_500]) {
    await wait(delay);
    const customer = oneCustomer(
      await dependencies.client.findCustomersByExternalReference(externalReference),
    );
    if (customer) return customer;
  }
  return null;
}

async function reconcileSubscriptionAfterAmbiguousWrite(
  externalReference: string,
  expectedCustomerId: string,
  dependencies: ProvisioningDependencies,
): Promise<AsaasSubscription | null> {
  const wait = dependencies.sleep ?? sleep;
  for (const delay of [250, 750, 1_500]) {
    await wait(delay);
    const subscription = oneSubscription(
      await dependencies.client.findSubscriptionsByExternalReference(externalReference),
      expectedCustomerId,
    );
    if (subscription) return subscription;
  }
  return null;
}

async function ensureCustomer(
  context: AsaasProvisioningContext,
  dependencies: ProvisioningDependencies,
): Promise<EnsuredResource> {
  const externalReference = customerExternalReference(context.clinic_id);
  const claim = await dependencies.store.claimOperation({
    environment: context.provider_environment,
    operationType: "customer_ensure",
    idempotencyKey: `clinic:${context.clinic_id}`,
    externalReference,
  });
  requireClaim(claim);

  if (claim.status === "succeeded" && claim.provider_resource_id) {
    if (!CUSTOMER_ID_PATTERN.test(claim.provider_resource_id)) {
      throw new AsaasProvisioningError(
        "INVALID_STORED_CUSTOMER_ID",
        "ID de cliente armazenado inválido.",
      );
    }
    await dependencies.store.bindCustomer({
      clinicId: context.clinic_id,
      environment: context.provider_environment,
      customerId: claim.provider_resource_id,
    });
    return { id: claim.provider_resource_id, reused: true };
  }

  const localCustomerId = context.provider_customer_id ?? context.external_customer_id;
  if (localCustomerId) {
    if (!CUSTOMER_ID_PATTERN.test(localCustomerId)) {
      await finishClaim(
        dependencies.store,
        claim,
        "failed",
        undefined,
        "INVALID_STORED_CUSTOMER_ID",
      );
      throw new AsaasProvisioningError(
        "INVALID_STORED_CUSTOMER_ID",
        "ID de cliente armazenado inválido.",
      );
    }
    await dependencies.store.bindCustomer({
      clinicId: context.clinic_id,
      environment: context.provider_environment,
      customerId: localCustomerId,
    });
    await finishClaim(dependencies.store, claim, "succeeded", localCustomerId);
    return { id: localCustomerId, reused: true };
  }

  try {
    let customer = oneCustomer(
      await dependencies.client.findCustomersByExternalReference(externalReference),
    );
    let reused = Boolean(customer);

    if (!customer) {
      try {
        customer = await dependencies.client.createCustomer({
          name: context.legal_name,
          cpfCnpj: context.tax_id_digits,
          email: context.billing_email,
          mobilePhone: context.billing_phone_digits,
          address: context.address_line,
          addressNumber: context.address_number,
          complement: context.address_complement || undefined,
          province: context.district,
          postalCode: context.postal_code_digits,
          externalReference,
        });
      } catch (error) {
        if (!(error instanceof AsaasApiError) || !error.ambiguous) throw error;
        customer = await reconcileCustomerAfterAmbiguousWrite(externalReference, dependencies);
        reused = Boolean(customer);
        if (!customer) {
          await finishClaim(dependencies.store, claim, "uncertain", undefined, error.code);
          throw new AsaasProvisioningError(
            "ASAAS_CUSTOMER_OUTCOME_UNCERTAIN",
            "O Asaas não confirmou a criação do cliente. Nova criação foi bloqueada até reconciliação.",
          );
        }
      }
    }

    if (customer.externalReference && customer.externalReference !== externalReference) {
      throw new AsaasProvisioningError(
        "ASAAS_CUSTOMER_REFERENCE_CONFLICT",
        "Referência do cliente Asaas divergente.",
      );
    }

    try {
      await dependencies.store.bindCustomer({
        clinicId: context.clinic_id,
        environment: context.provider_environment,
        customerId: customer.id,
      });
      await finishClaim(dependencies.store, claim, "succeeded", customer.id);
    } catch (error) {
      await finishClaim(
        dependencies.store,
        claim,
        "uncertain",
        undefined,
        operationErrorCode(error),
      ).catch(() => undefined);
      throw error;
    }
    return { id: customer.id, reused };
  } catch (error) {
    if (
      error instanceof AsaasProvisioningError &&
      error.code === "ASAAS_CUSTOMER_OUTCOME_UNCERTAIN"
    ) {
      throw error;
    }
    await finishClaim(
      dependencies.store,
      claim,
      "failed",
      undefined,
      operationErrorCode(error),
    ).catch(() => undefined);
    throw error;
  }
}

async function ensureSubscription(
  context: AsaasProvisioningContext,
  customerId: string,
  nextDueDate: string,
  billingType: AsaasBillingType,
  dependencies: ProvisioningDependencies,
): Promise<EnsuredResource> {
  const externalReference = subscriptionExternalReference(context.subscription_id);
  const claim = await dependencies.store.claimOperation({
    environment: context.provider_environment,
    operationType: "subscription_create",
    idempotencyKey: `subscription:${context.subscription_id}`,
    externalReference,
  });
  requireClaim(claim);

  if (claim.status === "succeeded" && claim.provider_resource_id) {
    if (!SUBSCRIPTION_ID_PATTERN.test(claim.provider_resource_id)) {
      throw new AsaasProvisioningError(
        "INVALID_STORED_SUBSCRIPTION_ID",
        "ID de assinatura armazenado inválido.",
      );
    }
    await dependencies.store.bindSubscription({
      subscriptionId: context.subscription_id,
      environment: context.provider_environment,
      customerId,
      providerSubscriptionId: claim.provider_resource_id,
    });
    return { id: claim.provider_resource_id, reused: true };
  }

  if (context.external_subscription_id) {
    if (!SUBSCRIPTION_ID_PATTERN.test(context.external_subscription_id)) {
      await finishClaim(
        dependencies.store,
        claim,
        "failed",
        undefined,
        "INVALID_STORED_SUBSCRIPTION_ID",
      );
      throw new AsaasProvisioningError(
        "INVALID_STORED_SUBSCRIPTION_ID",
        "ID de assinatura armazenado inválido.",
      );
    }
    await dependencies.store.bindSubscription({
      subscriptionId: context.subscription_id,
      environment: context.provider_environment,
      customerId,
      providerSubscriptionId: context.external_subscription_id,
    });
    await finishClaim(dependencies.store, claim, "succeeded", context.external_subscription_id);
    return { id: context.external_subscription_id, reused: true };
  }

  try {
    let subscription = oneSubscription(
      await dependencies.client.findSubscriptionsByExternalReference(externalReference),
      customerId,
    );
    let reused = Boolean(subscription);

    if (!subscription) {
      try {
        subscription = await dependencies.client.createMonthlySubscription({
          customer: customerId,
          billingType,
          value: Number((context.monthly_price_cents / 100).toFixed(2)),
          nextDueDate,
          cycle: ASAAS_BILLING_CYCLE,
          description: `DentalFlow · ${context.plan_name}`.slice(0, 500),
          externalReference,
        });
      } catch (error) {
        if (!(error instanceof AsaasApiError) || !error.ambiguous) throw error;
        subscription = await reconcileSubscriptionAfterAmbiguousWrite(
          externalReference,
          customerId,
          dependencies,
        );
        reused = Boolean(subscription);
        if (!subscription) {
          await finishClaim(dependencies.store, claim, "uncertain", undefined, error.code);
          throw new AsaasProvisioningError(
            "ASAAS_SUBSCRIPTION_OUTCOME_UNCERTAIN",
            "O Asaas não confirmou a criação da assinatura. Nova criação foi bloqueada até reconciliação.",
          );
        }
      }
    }

    if (subscription.customer !== customerId) {
      throw new AsaasProvisioningError(
        "ASAAS_SUBSCRIPTION_CUSTOMER_CONFLICT",
        "A assinatura Asaas retornada pertence a outro cliente.",
      );
    }
    if (subscription.externalReference && subscription.externalReference !== externalReference) {
      throw new AsaasProvisioningError(
        "ASAAS_SUBSCRIPTION_REFERENCE_CONFLICT",
        "Referência da assinatura Asaas divergente.",
      );
    }

    try {
      await dependencies.store.bindSubscription({
        subscriptionId: context.subscription_id,
        environment: context.provider_environment,
        customerId,
        providerSubscriptionId: subscription.id,
      });
      await finishClaim(dependencies.store, claim, "succeeded", subscription.id);
    } catch (error) {
      await finishClaim(
        dependencies.store,
        claim,
        "uncertain",
        undefined,
        operationErrorCode(error),
      ).catch(() => undefined);
      throw error;
    }
    return { id: subscription.id, reused };
  } catch (error) {
    if (
      error instanceof AsaasProvisioningError &&
      error.code === "ASAAS_SUBSCRIPTION_OUTCOME_UNCERTAIN"
    ) {
      throw error;
    }
    await finishClaim(
      dependencies.store,
      claim,
      "failed",
      undefined,
      operationErrorCode(error),
    ).catch(() => undefined);
    throw error;
  }
}

export async function provisionAsaasResources(
  context: AsaasProvisioningContext,
  input: Pick<ProvisionAsaasSubscriptionInput, "nextDueDate" | "billingType">,
  dependencies: ProvisioningDependencies,
): Promise<ProvisionAsaasSubscriptionResult> {
  if (dependencies.client.environment !== context.provider_environment) {
    throw new AsaasProvisioningError(
      "ASAAS_ENVIRONMENT_MISMATCH",
      "O ambiente Asaas diverge do contrato interno.",
    );
  }
  validateContext(context, dependencies.client.environment);
  const nextDueDate = validateNextDueDate(input.nextDueDate);
  const billingType = input.billingType ?? "UNDEFINED";
  if (!["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"].includes(billingType)) {
    throw new AsaasProvisioningError("INVALID_BILLING_TYPE", "Forma de pagamento inválida.");
  }

  const customer = await ensureCustomer(context, dependencies);
  const subscription = await ensureSubscription(
    context,
    customer.id,
    nextDueDate,
    billingType,
    dependencies,
  );

  return {
    environment: context.provider_environment,
    customerId: customer.id,
    subscriptionId: subscription.id,
    customerReused: customer.reused,
    subscriptionReused: subscription.reused,
    paymentConfirmed: false,
  };
}

export function createSupabaseAsaasProvisioningStore(): AsaasProvisioningStore {
  const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  return {
    async loadContext({ subscriptionId, actorUserId, environment }) {
      const supabase = await admin();
      const { data, error } = await supabase.rpc("billing_get_asaas_provisioning_context", {
        p_subscription_id: subscriptionId,
        p_actor_user_id: actorUserId,
        p_provider_environment: environment,
      });
      if (error) throw new AsaasProvisioningError("PROVISIONING_CONTEXT_FAILED", error.message);
      return data as unknown as AsaasProvisioningContext;
    },

    async claimOperation({ environment, operationType, idempotencyKey, externalReference }) {
      const supabase = await admin();
      const { data, error } = await supabase.rpc("billing_claim_provider_operation", {
        p_provider: ASAAS_PROVIDER,
        p_provider_environment: environment,
        p_operation_type: operationType,
        p_idempotency_key: idempotencyKey,
        p_external_reference: externalReference,
        p_lease_seconds: 120,
      });
      if (error) throw new AsaasProvisioningError("PROVIDER_OPERATION_CLAIM_FAILED", error.message);
      return data as unknown as ProviderOperationClaim;
    },

    async finishOperation({ operationId, leaseToken, status, providerResourceId, errorCode }) {
      const supabase = await admin();
      const { data, error } = await supabase.rpc("billing_finish_provider_operation", {
        p_operation_id: operationId,
        p_lease_token: leaseToken,
        p_status: status,
        p_provider_resource_id: providerResourceId,
        p_error_code: errorCode,
      });
      if (error || data !== true) {
        throw new AsaasProvisioningError(
          "PROVIDER_OPERATION_FINISH_FAILED",
          error?.message ?? "A lease da operação financeira expirou.",
        );
      }
    },

    async bindCustomer({ clinicId, environment, customerId }) {
      const supabase = await admin();
      const { error } = await supabase.rpc("billing_bind_asaas_customer", {
        p_clinic_id: clinicId,
        p_provider_environment: environment,
        p_provider_customer_id: customerId,
      });
      if (error) throw new AsaasProvisioningError("CUSTOMER_BIND_FAILED", error.message);
    },

    async bindSubscription({ subscriptionId, environment, customerId, providerSubscriptionId }) {
      const supabase = await admin();
      const { error } = await supabase.rpc("billing_bind_asaas_subscription", {
        p_subscription_id: subscriptionId,
        p_provider_environment: environment,
        p_provider_customer_id: customerId,
        p_provider_subscription_id: providerSubscriptionId,
      });
      if (error) throw new AsaasProvisioningError("SUBSCRIPTION_BIND_FAILED", error.message);
    },
  };
}

export async function provisionAsaasMonthlySubscription(
  input: ProvisionAsaasSubscriptionInput,
): Promise<ProvisionAsaasSubscriptionResult> {
  if (!UUID_PATTERN.test(input.subscriptionId) || !UUID_PATTERN.test(input.actorUserId)) {
    throw new AsaasProvisioningError(
      "INVALID_PROVISIONING_REQUEST",
      "Solicitação de assinatura inválida.",
    );
  }

  const config = loadAsaasConfig();
  const client = new AsaasClient(config);
  const store = createSupabaseAsaasProvisioningStore();
  const context = await store.loadContext({
    subscriptionId: input.subscriptionId,
    actorUserId: input.actorUserId,
    environment: config.environment,
  });

  return provisionAsaasResources(context, input, { client, store });
}
