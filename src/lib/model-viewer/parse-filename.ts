// Heurística para extrair título amigável a partir do nome do arquivo STL/PLY.

const PROTOCOLO_INF = /protocolo[_\s-]?inf(erior)?/i;
const PROTOCOLO_SUP = /protocolo[_\s-]?sup(erior)?/i;
const ARCADA_INF = /arcada[_\s-]?inf(erior)?/i;
const ARCADA_SUP = /arcada[_\s-]?sup(erior)?/i;
const WAXUP = /wax[_\s-]?up/i;
const COROA = /coroa/i;
const ONLAY = /onlay|inlay/i;

// Dentes FDI 11–48 (quadrantes 1-4)
const TOOTH_RE = /\b([1-4][1-8])\b/g;

export interface ParsedFileName {
  title: string;
  accent: string; // segunda palavra destacada
  teeth: string[];
  extension: "STL" | "PLY" | string;
}

export function parseModelFileName(fileName: string): ParsedFileName {
  const ext = (fileName.split(".").pop() ?? "").toUpperCase();
  const base = fileName.replace(/\.[^.]+$/, "");

  // Dentes detectados (FDI). Evita falso-positivo em datas (ex: 2026-06-06).
  const sanitized = base.replace(/\d{4}-\d{2}-\d{2}/g, " "); // remove yyyy-mm-dd
  const teethSet = new Set<string>();
  for (const m of sanitized.matchAll(TOOTH_RE)) teethSet.add(m[1]);
  const teeth = Array.from(teethSet).sort();

  let title = "";
  let accent = "";

  if (PROTOCOLO_INF.test(base)) { title = "Protocolo Inferior"; accent = "Inferior"; }
  else if (PROTOCOLO_SUP.test(base)) { title = "Protocolo Superior"; accent = "Superior"; }
  else if (ARCADA_INF.test(base)) { title = "Arcada Inferior"; accent = "Inferior"; }
  else if (ARCADA_SUP.test(base)) { title = "Arcada Superior"; accent = "Superior"; }
  else if (WAXUP.test(base) && teeth.length > 0) {
    title = teeth.length === 1 ? `Wax-up Dente ${teeth[0]}` : `Wax-up ${teeth.length} dentes`;
    accent = teeth.length === 1 ? teeth[0] : `${teeth.length} dentes`;
  }
  else if (COROA.test(base) && teeth.length > 0) {
    title = teeth.length === 1 ? `Coroa Dente ${teeth[0]}` : `Coroas ${teeth.length} dentes`;
    accent = teeth.length === 1 ? teeth[0] : `${teeth.length} dentes`;
  }
  else if (ONLAY.test(base) && teeth.length > 0) {
    title = `Onlay Dente ${teeth[0]}`;
    accent = teeth[0];
  }
  else if (teeth.length === 1) {
    title = `Dente ${teeth[0]}`;
    accent = teeth[0];
  }
  else if (teeth.length > 1) {
    title = `${teeth.length} dentes`;
    accent = `${teeth.length}`;
  }
  else {
    title = base.length > 40 ? `${base.slice(0, 40)}…` : base;
    accent = "";
  }

  return { title, accent, teeth, extension: ext };
}

/** Normaliza um nome para comparação de "mesma família de arquivo" entre versões. */
export function normalizeBaseName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/\d{4}-\d{2}-\d{2}[_-]?/g, "") // remove datas
    .replace(/\s*\(\d+\)\s*$/g, "")          // remove "(1)", "(2)"
    .replace(/[_\-\s]+/g, "")                // remove separadores
    .trim();
}
