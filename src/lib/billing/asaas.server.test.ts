import { describe, expect, it, vi } from "vitest";
import { AsaasApiError, AsaasClient, loadAsaasConfig, type AsaasConfig } from "./asaas.server";

const sandboxEnv = {
  ASAAS_ENVIRONMENT: "sandbox",
  ASAAS_API_KEY: "$aact_hmlg_test_key_that_is_never_logged",
  ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-token-with-at-least-32-characters",
  ASAAS_USER_AGENT: "DentalFlow/tests",
};

function config(overrides: Partial<AsaasConfig> = {}): AsaasConfig {
  return { ...loadAsaasConfig(sandboxEnv), minRequestIntervalMs: 0, ...overrides };
}

describe("loadAsaasConfig", () => {
  it("aceita Sandbox e deriva somente a URL oficial", () => {
    const loaded = loadAsaasConfig(sandboxEnv);
    expect(loaded.environment).toBe("sandbox");
    expect(loaded.baseUrl).toBe("https://api-sandbox.asaas.com/v3");
  });

  it("falha fechado quando chave e ambiente divergem", () => {
    expect(() =>
      loadAsaasConfig({ ...sandboxEnv, ASAAS_API_KEY: "$aact_prod_key_that_must_not_be_used" }),
    ).toThrow(/não pertence/i);
  });

  it("mantém Produção bloqueada sem liberação explícita", () => {
    expect(() =>
      loadAsaasConfig({
        ...sandboxEnv,
        ASAAS_ENVIRONMENT: "production",
        ASAAS_API_KEY: "$aact_prod_test_key_that_is_never_logged",
      }),
    ).toThrow(/produção permanece bloqueado/i);
  });

  it("nunca inclui o segredo na mensagem de configuração", () => {
    const secret = "$aact_hmlg_super_secret_value";
    let message = "";
    try {
      loadAsaasConfig({ ...sandboxEnv, ASAAS_ENVIRONMENT: "production", ASAAS_API_KEY: secret });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(secret);
  });
});

describe("AsaasClient", () => {
  it("busca assinatura por ID sem enviar corpo ou URL fornecida pelo webhook", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api-sandbox.asaas.com/v3/subscriptions/sub_ABC123");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      return Response.json({ id: "sub_ABC123", customer: "cus_ABC123", status: "INACTIVE" });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.getSubscription("sub_ABC123")).resolves.toMatchObject({
      id: "sub_ABC123",
      status: "INACTIVE",
    });
    await expect(client.getSubscription("../payment")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("envia os headers obrigatórios e filtra pela referência exata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("access_token")).toBe(sandboxEnv.ASAAS_API_KEY);
      expect(headers.get("User-Agent")).toBe(sandboxEnv.ASAAS_USER_AGENT);
      return Response.json({
        data: [
          { id: "cus_ABC123", externalReference: "dentalflow:company:one" },
          { id: "cus_OTHER", externalReference: "other" },
        ],
      });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });

    const customers = await client.findCustomersByExternalReference("dentalflow:company:one");

    expect(customers.map((customer) => customer.id)).toEqual(["cus_ABC123"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "externalReference=dentalflow%3Acompany%3Aone",
    );
  });

  it("não chama o fetch global com AsaasClient como receptor", async () => {
    let client!: AsaasClient;
    const runtimeFetch = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      if (this === client) throw new TypeError("Illegal invocation");
      expect(String(input)).toContain("externalReference=dentalflow%3Acompany%3Atest");
      return Promise.resolve(Response.json({ data: [] }));
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = runtimeFetch as typeof fetch;
    try {
      client = new AsaasClient(config({ maxGetRetries: 0 }));
      await expect(client.findCustomersByExternalReference("dentalflow:company:test")).resolves.toEqual([]);
      expect(runtimeFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("obedece RateLimit-Reset antes do retry de GET", async () => {
    const wait = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { errors: [{ code: "too_many_requests", description: "Aguarde" }] },
          { status: 429, headers: { "RateLimit-Reset": "2" } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const client = new AsaasClient(config({ maxGetRetries: 1 }), {
      fetch: fetchMock as typeof fetch,
      sleep: wait,
      random: () => 0,
    });

    await expect(client.findCustomersByExternalReference("safe-reference")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(2_000);
  });

  it("não repete POST após falha de rede inconclusiva", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("socket closed");
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });

    await expect(
      client.createCustomer({
        name: "Empresa Teste",
        cpfCnpj: "11222333000181",
        email: "financeiro@example.test",
        mobilePhone: "11999999999",
        address: "Rua Teste",
        addressNumber: "10",
        province: "Centro",
        postalCode: "01001000",
        externalReference: "dentalflow:company:test",
      }),
    ).rejects.toMatchObject({
      code: "ASAAS_NETWORK_ERROR",
      ambiguous: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recusa URL base injetada", () => {
    expect(() => new AsaasClient(config({ baseUrl: "https://example.test/v3" }))).toThrow(
      /não corresponde/i,
    );
  });

  it("lista somente cobranças pertencentes à assinatura solicitada", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api-sandbox.asaas.com/v3/subscriptions/sub_SAFE123/payments",
      );
      return Response.json({
        data: [
          {
            id: "pay_FIRST123",
            customer: "cus_SAFE123",
            subscription: "sub_SAFE123",
            invoiceUrl: "https://sandbox.asaas.com/i/safe-token",
          },
          {
            id: "pay_OTHER123",
            customer: "cus_SAFE123",
            subscription: "sub_OTHER123",
          },
        ],
      });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });

    await expect(client.listSubscriptionPayments("sub_SAFE123")).resolves.toEqual([
      expect.objectContaining({ id: "pay_FIRST123" }),
    ]);
  });

  it("limita a conciliação a uma página recente da assinatura correta", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v3/payments");
      expect(url.searchParams.get("subscription")).toBe("sub_SAFE123");
      expect(url.searchParams.get("dueDate[ge]")).toBe("2026-06-01");
      expect(url.searchParams.get("limit")).toBe("100");
      expect(url.searchParams.get("offset")).toBe("0");
      return Response.json({ hasMore: false, data: [
        { id: "pay_SAFE123", customer: "cus_SAFE123", subscription: "sub_SAFE123" },
      ] });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.listPaymentsForReconciliation("sub_SAFE123", "2026-06-01"))
      .resolves.toMatchObject([{ id: "pay_SAFE123" }]);
  });

  it("falha fechado quando a resposta da conciliação tem mais páginas ou outra assinatura", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      hasMore: true, data: [{ id: "pay_SAFE123", customer: "cus_SAFE123", subscription: "sub_SAFE123" }],
    })).mockResolvedValueOnce(Response.json({
      hasMore: false, data: [{ id: "pay_OTHER123", customer: "cus_SAFE123", subscription: "sub_OTHER123" }],
    }));
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.listPaymentsForReconciliation("sub_SAFE123", "2026-06-01"))
      .rejects.toMatchObject({ code: "ASAAS_RECONCILIATION_PAGE_INCOMPLETE" });
    await expect(client.listPaymentsForReconciliation("sub_SAFE123", "2026-06-01"))
      .rejects.toMatchObject({ code: "ASAAS_RECONCILIATION_OWNERSHIP_MISMATCH" });
  });

  it("consulta uma cobrança individual por GET antes de conciliar o webhook", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api-sandbox.asaas.com/v3/payments/pay_SAFE123");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      return Response.json({
        id: "pay_SAFE123",
        customer: "cus_SAFE123",
        subscription: "sub_SAFE123",
      });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.getPayment("pay_SAFE123")).resolves.toMatchObject({ id: "pay_SAFE123" });
    await expect(client.getPayment("../../customers")).rejects.toThrow(/inválida/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aceita somente a URL de fatura do mesmo ambiente", () => {
    const client = new AsaasClient(config());

    expect(client.validatePaymentUrl("https://sandbox.asaas.com/i/safe-token")).toBe(
      "https://sandbox.asaas.com/i/safe-token",
    );
    expect(() => client.validatePaymentUrl("https://www.asaas.com/i/prod-token")).toThrow(
      /fora do ambiente/i,
    );
    expect(() => client.validatePaymentUrl("https://example.test/i/fake")).toThrow(
      /fora do ambiente/i,
    );
  });
});


describe("recurring subscription update transport", () => {
  it("uses PUT and explicitly preserves already issued invoices", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api-sandbox.asaas.com/v3/subscriptions/sub_SAFE123");
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({ value: 1, nextDueDate: "2026-11-01", updatePendingPayments: false });
      return Response.json({ id: "sub_SAFE123", customer: "cus_SAFE123", value: 1 });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.updateSubscription("sub_SAFE123", { value: 1, nextDueDate: "2026-11-01" })).resolves.toMatchObject({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("inactivates recurrence without deleting invoices or sending a new price", async () => {
    const fetchMock = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ status: "INACTIVE", updatePendingPayments: false });
      return Response.json({ id: "sub_SAFE123", customer: "cus_SAFE123", status: "INACTIVE" });
    });
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await client.updateSubscription("sub_SAFE123", { status: "INACTIVE" });
  });
  it.each([{}, { value: 0 }, { value: -1 }, { value: NaN }, { value: 1.001 },
    { nextDueDate: "2026-02-30" }, { nextDueDate: "not-a-date" }, { status: "ACTIVE" },
    { status: "INACTIVE", updatePendingPayments: true }, { customer: "cus_OTHER123" }])("rejects invalid or unsupported changes before HTTP: %j", async (input) => {
    const fetchMock = vi.fn();
    const client = new AsaasClient(config(), { fetch: fetchMock as typeof fetch });
    await expect(client.updateSubscription("sub_SAFE123", input as never)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["network", "server", "empty", "invalid", "different", "body-read"])("requires reconciliation without repeating PUT after %s failure", async (kind) => {
    const fetchMock = vi.fn(async () => {
      if (kind === "network") throw new TypeError("socket closed");
      if (kind === "server") return Response.json({}, { status: 503 });
      if (kind === "empty") return new Response("");
      if (kind === "invalid") return Response.json({ id: "bad" });
      if (kind === "body-read") { const response = Response.json({}); vi.spyOn(response, "text").mockRejectedValue(new Error("body interrupted")); return response; }
      return Response.json({ id: "sub_OTHER123", customer: "cus_SAFE123" });
    });
    const client = new AsaasClient(config({ maxGetRetries: 4 }), { fetch: fetchMock as typeof fetch });
    await expect(client.updateSubscription("sub_SAFE123", { status: "INACTIVE" })).rejects.toMatchObject({ ambiguous: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
