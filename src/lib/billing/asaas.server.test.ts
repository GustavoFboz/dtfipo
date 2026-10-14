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
});
