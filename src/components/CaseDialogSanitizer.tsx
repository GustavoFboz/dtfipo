import { useEffect } from "react";

const HIDDEN_LABELS = new Set([
  "TIPOS DE CASO",
  "TIPO(S) DE CASO",
  "TIPO(S) DE CASO(S)",
  "OBSERVAÇÕES",
  "OBSERVAÇÕES :",
]);

function normalize(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function hideLegacyCaseFields() {
  const candidates = document.querySelectorAll("label, div, span");
  candidates.forEach((node) => {
    if (!HIDDEN_LABELS.has(normalize(node.textContent))) return;
    const el = node as HTMLElement;
    // NewCaseDialog fields are `space-y-2`; CaseDetail blocks use `space-y-1.5`.
    const section = el.closest(".space-y-2, .space-y-1\\.5") as HTMLElement | null;
    if (section) {
      section.dataset.legacyCaseFieldHidden = "true";
      section.style.display = "none";
      return;
    }
    const parent = el.parentElement as HTMLElement | null;
    if (parent && parent.childElementCount <= 4) {
      parent.dataset.legacyCaseFieldHidden = "true";
      parent.style.display = "none";
    }
  });
}

export function CaseDialogSanitizer() {
  useEffect(() => {
    hideLegacyCaseFields();
    const observer = new MutationObserver(hideLegacyCaseFields);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
