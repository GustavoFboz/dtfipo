import { describe, expect, it } from "vitest";

import { applyPlainWorkToothSelection, applyToothModifierSelection } from "./tooth-selection";

const sorted = (items: number[]) => [...items].sort((a, b) => a - b);

describe("applyToothModifierSelection", () => {
  it("Ctrl adiciona um único dente sem remover a seleção existente e redefine a âncora", () => {
    const result = applyToothModifierSelection([11, 12, 13], 21, 11, { ctrl: true, shift: false });
    expect(result).not.toBeNull();
    expect(sorted(result!.next)).toEqual([11, 12, 13, 21]);
    expect(result!.anchor).toBe(21);
    expect(result!.kind).toBe("toggle-add");
  });

  it("Ctrl remove somente o dente clicado e redefine a âncora", () => {
    const result = applyToothModifierSelection([11, 12, 13], 12, 11, { ctrl: true, shift: false });
    expect(sorted(result!.next)).toEqual([11, 13]);
    expect(result!.anchor).toBe(12);
    expect(result!.removed).toEqual([12]);
  });

  it("Shift adiciona o intervalo contínuo sem apagar seleções independentes", () => {
    const result = applyToothModifierSelection([18, 11, 31], 14, 18, { ctrl: false, shift: true });
    expect(sorted(result!.next)).toEqual(sorted([18, 17, 16, 15, 14, 11, 31]));
    expect(result!.anchor).toBe(18);
    expect(result!.kind).toBe("range-add");
  });

  it("Shift remove o intervalo quando todos os dentes do intervalo já estão selecionados", () => {
    const result = applyToothModifierSelection([18, 17, 16, 15, 14, 11, 31], 14, 18, { ctrl: false, shift: true });
    expect(sorted(result!.next)).toEqual([11, 31]);
    expect(result!.removed).toEqual([18, 17, 16, 15, 14]);
    expect(result!.anchor).toBe(18);
    expect(result!.kind).toBe("range-remove");
  });

  it("Ctrl cria uma nova âncora para o próximo Shift sem perder a seleção anterior", () => {
    const firstRange = applyToothModifierSelection([18], 14, 18, { ctrl: false, shift: true })!;
    const newAnchor = applyToothModifierSelection(firstRange.next, 23, firstRange.anchor, { ctrl: true, shift: false })!;
    const secondRange = applyToothModifierSelection(newAnchor.next, 26, newAnchor.anchor, { ctrl: false, shift: true })!;

    expect(sorted(secondRange.next)).toEqual(sorted([18, 17, 16, 15, 14, 23, 24, 25, 26]));
    expect(secondRange.anchor).toBe(23);
  });

  it("não cria intervalo Shift atravessando da arcada superior para a inferior", () => {
    expect(applyToothModifierSelection([11], 41, 11, { ctrl: false, shift: true })).toBeNull();
  });

  it("não interfere em clique sem modificadores", () => {
    expect(applyToothModifierSelection([11, 12], 13, 11, { ctrl: false, shift: false })).toBeNull();
  });
});

describe("applyPlainWorkToothSelection", () => {
  it("remove toda seleção temporária feita com atalhos e mantém apenas o dente clicado", () => {
    expect(applyPlainWorkToothSelection([11, 12, 13, 14], 21, [])).toEqual([21]);
  });

  it("preserva dentes que já têm trabalho configurado sem mantê-los como seleção temporária", () => {
    expect(sorted(applyPlainWorkToothSelection([11, 12, 13, 14], 21, [11, 13]))).toEqual([11, 13, 21]);
  });

  it("ao clicar em um dos dentes da multiseleção, deixa somente ele quando nenhum possui configuração", () => {
    expect(applyPlainWorkToothSelection([11, 12, 13], 12, [])).toEqual([12]);
  });
});
