// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest";
import {publicBetaRoute, publicBetaErrorCategory, reportLovableError} from "./lovable-error-reporting";

afterEach(() => {
  delete window.__lovableEvents;
  delete window.__lovableReportRuntimeError;
  window.history.replaceState({}, "", "/");
});

describe("beta diagnostic privacy", () => {
  it("does not report patient names, secrets, signed URLs, stack traces or caller context", () => {
    const events=vi.fn(), preview=vi.fn();
    window.__lovableEvents={captureException:events};
    window.__lovableReportRuntimeError=preview;
    window.history.replaceState({}, "", "/casos/9b80ad46-5d4f-45d5-a949-6dffb8514702?token=SECRET");
    const error=new Error("Failed to fetch patient João Silva, CPF 123.456.789-00, token=SECRET");
    error.stack="SECRET PHI stack";
    reportLovableError(error,{patientName:"João Silva",token:"SECRET",cpf:"12345678900"});
    expect(events).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(1);
    const sent=JSON.stringify([...events.mock.calls,...preview.mock.calls].map(call=>call.map(value=>value instanceof Error?{message:value.message}:value)));
    for(const sensitive of ["João","SECRET","12345678900","9b80ad46","PHI stack"]){
      expect(sent).not.toContain(sensitive);
    }
    expect(sent).toContain("network");
    expect(sent).toContain("casos");
  });

  it("maps known HTTP errors into fixed categories without exposing response URLs", () => {
    expect(publicBetaErrorCategory(new Response(null,{status:401}))).toBe("unauthorized");
    expect(publicBetaErrorCategory(new Response(null,{status:403}))).toBe("forbidden");
    expect(publicBetaErrorCategory(new Response(null,{status:404}))).toBe("not_found");
    expect(publicBetaErrorCategory(new Response(null,{status:503}))).toBe("server");
  });

  it("redacts arbitrary route segments and does not accept dynamic groups", () => {
    expect(publicBetaRoute("/pacientes/SECRET-CPF")).toBe("pacientes");
    expect(publicBetaRoute("/some-patient-name/other")).toBe("other");
    expect(publicBetaRoute("/")).toBe("home");
  });

  it("keeps unknown objects opaque", () => {
    expect(publicBetaErrorCategory({message:"PATIENT_PHI"})).toBe("unknown");
    expect(publicBetaErrorCategory(new TypeError("sensitive"))).toBe("render");
  });
});
