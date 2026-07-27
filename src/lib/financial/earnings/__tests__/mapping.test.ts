import { describe, it, expect } from "vitest";
import { calculateFinancials } from "../../calculation-engine/engine";
import { calculationToEarningEntries } from "../services";
import { canTransition } from "../types";

describe("calculationToEarningEntries", () => {
  it("filters out skipped or zero-total participants", () => {
    const res = calculateFinancials({
      case: { id: "c1", clinic_id: "cl1", status: "FINALIZADO", teeth_count: 2, received_amount: 100 },
      participants: [
        { id: "p1", professional_id: "u1", inline_rule: { rule_type: "FIXED", fixed_amount: 50 } },
        { id: "p2", professional_id: "u2", inline_rule: { rule_type: "FIXED", fixed_amount: 0 } },
        { id: "p3", professional_id: "u3" }, // no rule → skipped
      ],
    });
    const entries = calculationToEarningEntries(res);
    expect(entries).toHaveLength(1);
    expect(entries[0].professional_id).toBe("u1");
    expect(entries[0].amount).toBe(50);
  });
});

describe("canTransition", () => {
  it("allows the lifecycle pending→approved→available→paid", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("approved", "available")).toBe(true);
    expect(canTransition("available", "paid")).toBe(true);
  });
  it("blocks illegal transitions", () => {
    expect(canTransition("pending", "available")).toBe(false);
    expect(canTransition("pending", "paid")).toBe(false);
    expect(canTransition("paid", "canceled")).toBe(false);
    expect(canTransition("approved", "paid")).toBe(false);
  });
  it("allows cancel from any non-terminal state", () => {
    expect(canTransition("pending", "canceled")).toBe(true);
    expect(canTransition("approved", "canceled")).toBe(true);
    expect(canTransition("available", "canceled")).toBe(true);
  });
});