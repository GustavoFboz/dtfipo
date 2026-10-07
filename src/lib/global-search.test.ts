import { describe, expect, it } from "vitest";
import {
  groupActiveCasesByPatient,
  normalizeSearchText,
  patientSearchRank,
  rankPatientsForSearch,
} from "./global-search";
import type { Patient } from "./types";

const patient = (id: string, name: string) => ({
  id,
  name,
  photo_url: null,
  notes: null,
  first_name: null,
  last_name: null,
  age: 0,
  birth_date: null,
  gender: null,
  cpf: null,
  rg: null,
  phone: null,
  email: null,
  address: null,
  medical_history: null,
  allergies: null,
  medications: null,
  clinical_notes: null,
}) as Patient;

describe("patient-first global search", () => {
  it("normalizes accents and repeated spaces", () => {
    expect(normalizeSearchText("  José   da Silva ")).toBe("jose da silva");
  });

  it("prioritizes an exact full-name match", () => {
    const rows = [
      patient("1", "Ana Cristina Souza"),
      patient("2", "Ana Cristina"),
      patient("3", "Cristina Ana"),
    ];
    expect(rankPatientsForSearch(rows, "Ana Cristina").map((row) => row.id)).toEqual(["2", "1"]);
    expect(rankPatientsForSearch(rows, "Ana Cristina")[0].__searchExact).toBe(true);
  });

  it("supports partial multi-token matching without requiring contiguous text", () => {
    expect(patientSearchRank("Maria Doroteia Furtado Pereira", "maria per")).toBeLessThan(Infinity);
  });

  it("groups only cases still in progress", () => {
    const grouped = groupActiveCasesByPatient([
      { id: "a", patient_id: "p1", case_number: 1, case_label: null, status: "em_andamento", entry_date: "2026-10-01", delivery_date: "2026-10-10" },
      { id: "b", patient_id: "p1", case_number: 2, case_label: null, status: "finalizado", entry_date: "2026-10-02", delivery_date: "2026-10-11" },
      { id: "c", patient_id: "p2", case_number: 3, case_label: null, status: "active", entry_date: "2026-10-03", delivery_date: "2026-10-12" },
    ], ["p1", "p2"]);
    expect(grouped.p1.map((row) => row.id)).toEqual(["a"]);
    expect(grouped.p2.map((row) => row.id)).toEqual(["c"]);
  });
});
