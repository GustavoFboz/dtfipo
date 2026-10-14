import { describe, expect, it, vi } from "vitest";
import { AsaasApiError } from "./asaas.server";
import {
  AsaasProvisioningError,
  provisionAsaasResources,
  type AsaasProvisioningContext,
  type AsaasProvisioningStore,
  type ProviderOperationClaim,
} from "./asaas-provisioning.server";

const clinicId = "11111111-1111-4111-8111-111111111111";
const internalSubscriptionId = "22222222-2222-4222-8222-222222222222";

function context(overrides: Partial<AsaasProvisioningContext> = {}): AsaasProvisioningContext {
  return {
    subscription_id: internalSubscriptionId,
    clinic_id: clinicId,
    clinic_name: "Clínica Teste",
    plan_code: "company_initial",
    plan_name: "Inicial",
    monthly_price_cents: 19_900,
    currency: "BRL",
    billing_day: 10,
    provider_environment: "sandbox",
    provider_customer_id: null,
    external_customer_id: null,
    external_subscription_id: null,
    legal_name: "Clínica Teste LTDA",
    tax_id_digits: "11222333000181",
    billing_email: "financeiro@example.test",
    billing_phone_digits: "11999999999",
    postal_code_digits: "01001000",
    address_line: "Praça da Sé",
    address_number: "10",
    address_complement: null,
    district: "Sé",
    city: "São Paulo",
    state: "SP",
    country_code: "BR",
    ...overrides,
  };
}

function claimed(index: number): ProviderOperationClaim {
  return {
    operation_id: `33333333-3333-4333-8333-33333333333${index}`,
    claimed: true,
    status: "in_progress",
    lease_token: `44444444-4444-4444-8444-44444444444${index}`,
    attempt_count: 1,
  };
}

function store(claims: ProviderOperationClaim[]): AsaasProvisioningStore & {
  claimOperation: ReturnType<typeof vi.fn>;
  finishOperation: ReturnType<typeof vi.fn>;
  bindCustomer: ReturnType<typeof vi.fn>;
  bindSubscription: ReturnType<typeof vi.fn>;
} {
  return {
    loadContext: vi.fn(),
    claimOperation: vi.fn().mockImplementation(async () => {
      const next = claims.shift();
      if (!next) throw new Error("missing claim");
      return next;
    }),
    finishOperation: vi.fn(async () => undefined),
    bindCustomer: vi.fn(async () => undefined),
    bindSubscription: vi.fn(async () => undefined),
  };
}

describe("provisionAsaasResources", () => {
  it("cria cliente e assinatura mensal uma única vez e persiste ambos os vínculos", async () => {
    const persistence = store([claimed(1), claimed(2)]);
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: vi.fn(async () => []),
      createCustomer: vi.fn(async (input: { externalReference: string }) => ({
        id: "cus_CREATED1",
        externalReference: input.externalReference,
      })),
      findSubscriptionsByExternalReference: vi.fn(async () => []),
      createMonthlySubscription: vi.fn(
        async (input: {
          customer: string;
          cycle: string;
          externalReference: string;
          value: number;
        }) => ({
          id: "sub_CREATED1",
          customer: input.customer,
          cycle: input.cycle,
          externalReference: input.externalReference,
          value: input.value,
        }),
      ),
    };

    const result = await provisionAsaasResources(
      context(),
      { nextDueDate: "2026-10-10", billingType: "UNDEFINED" },
      { client, store: persistence },
    );

    expect(result).toEqual({
      environment: "sandbox",
      customerId: "cus_CREATED1",
      subscriptionId: "sub_CREATED1",
      customerReused: false,
      subscriptionReused: false,
      paymentConfirmed: false,
    });
    expect(client.createCustomer).toHaveBeenCalledTimes(1);
    expect(client.createMonthlySubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_CREATED1",
        cycle: "MONTHLY",
        value: 199,
        externalReference: `dentalflow:subscription:${internalSubscriptionId}`,
      }),
    );
    expect(persistence.bindCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_CREATED1" }),
    );
    expect(persistence.bindSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: "sub_CREATED1" }),
    );
    expect(persistence.finishOperation).toHaveBeenCalledTimes(2);
  });

  it("reutiliza vínculos internos sem consultar ou recriar recursos externos", async () => {
    const persistence = store([claimed(1), claimed(2)]);
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: vi.fn(),
      createCustomer: vi.fn(),
      findSubscriptionsByExternalReference: vi.fn(),
      createMonthlySubscription: vi.fn(),
    };

    const result = await provisionAsaasResources(
      context({ provider_customer_id: "cus_EXISTING1", external_subscription_id: "sub_EXISTING1" }),
      { nextDueDate: "2026-10-10" },
      { client, store: persistence },
    );

    expect(result.customerReused).toBe(true);
    expect(result.subscriptionReused).toBe(true);
    expect(client.findCustomersByExternalReference).not.toHaveBeenCalled();
    expect(client.createCustomer).not.toHaveBeenCalled();
    expect(client.findSubscriptionsByExternalReference).not.toHaveBeenCalled();
    expect(client.createMonthlySubscription).not.toHaveBeenCalled();
  });

  it("reconcilia por externalReference após POST inconclusivo sem repetir a criação", async () => {
    const persistence = store([claimed(1), claimed(2)]);
    const findCustomers = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "cus_RECOVERED1",
          externalReference: `dentalflow:company:${clinicId}`,
        },
      ]);
    const createCustomer = vi.fn(async () => {
      throw new AsaasApiError({
        code: "ASAAS_TIMEOUT",
        message: "timeout",
        retryable: true,
        ambiguous: true,
      });
    });
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: findCustomers,
      createCustomer,
      findSubscriptionsByExternalReference: vi.fn(async (externalReference: string) => [
        { id: "sub_EXISTING2", customer: "cus_RECOVERED1", externalReference },
      ]),
      createMonthlySubscription: vi.fn(),
    };

    const result = await provisionAsaasResources(
      context(),
      { nextDueDate: "2026-10-10" },
      { client, store: persistence, sleep: async () => undefined },
    );

    expect(result.customerId).toBe("cus_RECOVERED1");
    expect(result.customerReused).toBe(true);
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(findCustomers).toHaveBeenCalledTimes(2);
    expect(client.createMonthlySubscription).not.toHaveBeenCalled();
  });

  it("bloqueia uma segunda execução enquanto a lease está ativa", async () => {
    const persistence = store([
      {
        operation_id: "33333333-3333-4333-8333-333333333339",
        claimed: false,
        status: "in_progress",
        busy: true,
        retry_after_seconds: 17,
        attempt_count: 1,
      },
    ]);
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: vi.fn(),
      createCustomer: vi.fn(),
      findSubscriptionsByExternalReference: vi.fn(),
      createMonthlySubscription: vi.fn(),
    };

    await expect(
      provisionAsaasResources(
        context(),
        { nextDueDate: "2026-10-10" },
        { client, store: persistence },
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_OPERATION_BUSY",
      retryAfterSeconds: 17,
    });
    expect(client.createCustomer).not.toHaveBeenCalled();
  });

  it("mantém resultado incerto bloqueado até reconciliação manual", async () => {
    const persistence = store([
      {
        operation_id: "33333333-3333-4333-8333-333333333338",
        claimed: false,
        status: "uncertain",
        manual_review: true,
        attempt_count: 1,
      },
    ]);
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: vi.fn(),
      createCustomer: vi.fn(),
      findSubscriptionsByExternalReference: vi.fn(),
      createMonthlySubscription: vi.fn(),
    };

    await expect(
      provisionAsaasResources(
        context(),
        { nextDueDate: "2026-10-10" },
        { client, store: persistence },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_OPERATION_REVIEW_REQUIRED" });
    expect(client.findCustomersByExternalReference).not.toHaveBeenCalled();
    expect(client.createCustomer).not.toHaveBeenCalled();
  });

  it("falha fechado quando a referência encontra clientes duplicados", async () => {
    const persistence = store([claimed(1)]);
    const externalReference = `dentalflow:company:${clinicId}`;
    const client = {
      environment: "sandbox" as const,
      findCustomersByExternalReference: vi.fn(async () => [
        { id: "cus_DUPLICATE1", externalReference },
        { id: "cus_DUPLICATE2", externalReference },
      ]),
      createCustomer: vi.fn(),
      findSubscriptionsByExternalReference: vi.fn(),
      createMonthlySubscription: vi.fn(),
    };

    await expect(
      provisionAsaasResources(
        context(),
        { nextDueDate: "2026-10-10" },
        { client, store: persistence },
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_ASAAS_CUSTOMER" });
    expect(client.createCustomer).not.toHaveBeenCalled();
    expect(persistence.finishOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "DUPLICATE_ASAAS_CUSTOMER" }),
    );
  });
});
