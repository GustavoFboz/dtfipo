import { describe, expect, it } from "vitest";
import { readableLoginError } from "./auth-errors";

describe("DentalFlow iOS login errors", () => {
  it("maps a blocked backend without leaking its URL", () => {
    expect(readableLoginError(new TypeError("Failed to fetch: https://private.example/auth")))
      .toBe("Não foi possível conectar ao DentalFlow. Verifique a internet ou tente novamente mais tarde.");
  });
  it("maps invalid credentials", () => {
    expect(readableLoginError({ message: "Invalid login credentials" }))
      .toContain("E-mail ou senha incorretos");
  });
  it("maps missing Cloud configuration", () => {
    expect(readableLoginError(new Error("Missing Supabase environment variable(s): SUPABASE_URL")))
      .toContain("ainda não está configurada");
  });
  it("does not render unexpected server internals", () => {
    expect(readableLoginError(new Error("token=secret123")))
      .not.toContain("secret123");
  });
  it("maps rate limiting and email confirmation", () => {
    expect(readableLoginError(new Error("Too many requests"))).toContain("Muitas tentativas");
    expect(readableLoginError(new Error("Email not confirmed"))).toContain("Confirme");
  });
});
