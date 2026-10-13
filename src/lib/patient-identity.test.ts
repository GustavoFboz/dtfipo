import { describe, expect, it } from "vitest";
import {
  hasPatientIdentifier,
  normalizePatientName,
  patientDuplicateErrorMessage,
  samePatientIdentity,
} from "./patient-identity";

describe("patient identity safeguards", () => {
  it("normalizes accents, case and repeated spaces in names", () => {
    expect(normalizePatientName("  JOSÉ   da   Silva ")).toBe("jose da silva");
  });

  it("requires one additional identifier when the same name is reused", () => {
    expect(hasPatientIdentifier({ cpf: "", rg: "", phone: "" })).toBe(false);
    expect(hasPatientIdentifier({ cpf: "", rg: "MG-12.345", phone: "" })).toBe(true);
    expect(hasPatientIdentifier({ cpf: "", rg: "", phone: "(92) 99999-0000" })).toBe(true);
  });

  it("matches CPF and RG after punctuation is removed", () => {
    expect(samePatientIdentity({ cpf: "123.456.789-00" }, { cpf: "12345678900" })).toBe(true);
    expect(samePatientIdentity({ rg: "MG-12.345" }, { rg: "mg12345" })).toBe(true);
  });

  it("uses phone as fallback only when both records lack CPF and RG", () => {
    expect(samePatientIdentity({ phone: "(92) 99999-0000" }, { phone: "92999990000" })).toBe(true);
    expect(samePatientIdentity(
      { cpf: "111.111.111-11", phone: "92999990000" },
      { cpf: "222.222.222-22", phone: "92999990000" },
    )).toBe(false);
  });

  it("maps backend duplicate errors to concise Portuguese guidance", () => {
    expect(patientDuplicateErrorMessage({ message: "PATIENT_DUPLICATE_NAME_REQUIRES_IDENTIFIER" }))
      .toContain("informe CPF, RG ou telefone");
    expect(patientDuplicateErrorMessage({ message: "PATIENT_DUPLICATE_IDENTITY_EXISTS" }))
      .toContain("selecione o cadastro existente");
    expect(patientDuplicateErrorMessage({ message: "other error" })).toBeNull();
  });
});
