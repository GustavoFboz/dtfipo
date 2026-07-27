// n8: Tipos de trabalho por dente — fixos, definidos em código.
// Cada dente pode receber um destes 7 tipos no menu do dente.
export type ToothWorkType = { id: string; name: string; abbreviation: string };

export const TOOTH_WORK_TYPES: ToothWorkType[] = [
  { id: "coroa", name: "Coroa", abbreviation: "CR" },
  { id: "faceta", name: "Faceta", abbreviation: "FC" },
  { id: "onlay", name: "OnLay", abbreviation: "ON" },
  { id: "inlay", name: "InLay", abbreviation: "IN" },
  { id: "endocrown", name: "EndoCrown", abbreviation: "EC" },
  { id: "copping", name: "Copping", abbreviation: "CP" },
  { id: "pino-nucleo", name: "Pino/Núcleo", abbreviation: "PN" },
];

// Trabalho extra cumulativo: pode coexistir com qualquer tipo primário
// (ex.: "coroa" + "enceramento") mas nunca duplica o tipo primário.
export const ENCERAMENTO_ID = "enceramento";
export const ENCERAMENTO_LABEL = "Enceramento";
export const ENCERAMENTO_ABBR = "EN";

export function splitToothTypes(ids: string[] | null | undefined): {
  primary: string;
  hasEnceramento: boolean;
} {
  const arr = Array.isArray(ids) ? ids : [];
  const hasEnceramento = arr.includes(ENCERAMENTO_ID);
  const primary = arr.find((x) => x && x !== ENCERAMENTO_ID) ?? "";
  return { primary, hasEnceramento };
}

export function buildToothTypes(primary: string, hasEnceramento: boolean): string[] {
  const out: string[] = [];
  if (primary) out.push(primary);
  if (hasEnceramento) out.push(ENCERAMENTO_ID);
  return out;
}

export const toothWorkTypeName = (id: string | null | undefined): string | null => {
  if (!id) return null;
  return TOOTH_WORK_TYPES.find((t) => t.id === id)?.name ?? null;
};
