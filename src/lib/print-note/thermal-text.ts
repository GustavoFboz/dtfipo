import type { CaseRow } from "@/lib/types";
import { buildInterpolateContext, fieldValue, interpolate, visibleFields } from "./context";
import type { PrintNoteTemplate } from "./types";

const ESC = 0x1b;

type Align = "left" | "center" | "right";

const alignCode: Record<Align, number> = { left: 0, center: 1, right: 2 };

function sanitizeForPrinter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const CP850: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "å": 0x86, "ç": 0x87,
  "ê": 0x88, "ë": 0x89, "è": 0x8a, "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "Å": 0x8f,
  "É": 0x90, "æ": 0x91, "Æ": 0x92, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97,
  "ÿ": 0x98, "Ö": 0x99, "Ü": 0x9a, "ø": 0x9b, "£": 0x9c, "Ø": 0x9d, "×": 0x9e, "ƒ": 0x9f,
  "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7,
  "¿": 0xa8, "®": 0xa9, "¬": 0xaa, "½": 0xab, "¼": 0xac, "¡": 0xad, "«": 0xae, "»": 0xaf,
  "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "©": 0xb8, "ã": 0xc6, "Ã": 0xc7, "Ê": 0xd2, "Ë": 0xd3,
  "È": 0xd4, "Í": 0xd6, "Î": 0xd7, "Ï": 0xd8, "Ó": 0xe0, "Ô": 0xe2, "Ò": 0xe3, "õ": 0xe4,
  "Õ": 0xe5, "Ú": 0xe9, "Û": 0xea, "Ù": 0xeb, "ý": 0xec, "Ý": 0xed,
};

function cleanForCp850(value: string, trim = true): string {
  const cleaned = value
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\nÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»ÁÂÀ©ãÃÊËÈÍÎÏÓÔÒõÕÚÛÙýÝ]/g, " ")
    .replace(/[ \t]+/g, " ");
  return trim ? cleaned.trim() : cleaned;
}

function encodeCp850(value: string, trim = true): number[] {
  const safe = cleanForCp850(value, trim);
  const bytes: number[] = [];
  for (const ch of safe) {
    const code = ch.charCodeAt(0);
    bytes.push(code <= 0x7f ? code : (CP850[ch] ?? 0x20));
  }
  return bytes;
}

function wrapText(value: string, width: number): string[] {
  const text = cleanForCp850(value || "-");
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      line = "";
      continue;
    }

    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function alignText(value: string, width: number, align: Align): string {
  if (value.length >= width || align === "left") return value;
  const space = width - value.length;
  if (align === "right") return " ".repeat(space) + value;
  const left = Math.floor(space / 2);
  return " ".repeat(left) + value;
}

function upper(value: string): string {
  return sanitizeForPrinter(value).toUpperCase();
}

/**
 * Monta a nota em texto ESC/POS nativo. Esse caminho usa a fonte interna da
 * impressora em vez de imagem/raster, reduzindo drasticamente bytes enviados
 * por Bluetooth e mantendo campos, cabeçalho, checklist e rodapé configuráveis.
 */
export function buildNativeThermalNote(c: CaseRow, tpl: PrintNoteTemplate): Uint8Array {
  const columns = tpl.paper === "80mm" ? 48 : 32;
  const bytes: number[] = [];
  const push = (...items: number[]) => bytes.push(...items);
  const command = (...items: number[]) => push(...items);

  const style = (mode: number, align: Align = "left") => {
    command(ESC, 0x61, alignCode[align]); // ESC a — alinhamento
    command(ESC, 0x21, mode);             // ESC ! — fonte interna / tamanho
  };

  const line = (value = "") => {
    push(...encodeCp850(value, false));
    push(0x0a);
  };

  const wrapped = (value: string, width = columns, align: Align = "left") => {
    for (const ln of wrapText(value, width)) line(alignText(ln, width, align));
  };

  const separator = (char = "-") => line(char.repeat(columns));
  const ictx = buildInterpolateContext(c);
  const title = interpolate(tpl.header.title || "", ictx).trim() || "-";
  const subtitle = interpolate(tpl.header.subtitle || "", ictx).trim();
  const footer = interpolate(tpl.footer || "", ictx).trim();

  command(ESC, 0x74, 0x02); // CP850: preserva acentos comuns em PT-BR sem raster.
  command(ESC, 0x33, 0x20); // Espaçamento de linha estável, sem raster pesado.

  style(0x38, "center"); // negrito + altura dupla + largura dupla
  wrapped(title, Math.floor(columns / 2), "center");

  if (subtitle) {
    style(0x08, "center");
    wrapped(subtitle, columns, "center");
  }

  style(0x00);
  separator("=");

  for (const f of visibleFields(tpl.fields)) {
    const label = upper(f.label || f.key);
    const value = fieldValue(c, f.key);

    style(0x08);
    wrapped(`${label}:`, columns);
    style(0x18); // negrito + altura dupla; legível sem dobrar largura.
    wrapped(value, columns);
    style(0x00);
    line();
  }

  if (tpl.checklist.length) {
    separator("-");
    style(0x08, "center");
    wrapped("CHECKLIST", columns, "center");
    style(0x00);

    for (const item of tpl.checklist.filter(i => i.trim())) {
      const prefix = "[ ] ";
      const wrappedItem = wrapText(item, columns - prefix.length);
      line(prefix + wrappedItem[0]);
      for (const extra of wrappedItem.slice(1)) line(" ".repeat(prefix.length) + extra);
    }
  }

  if (footer) {
    separator("-");
    style(0x00, "center");
    wrapped(footer, columns, "center");
  }

  style(0x00);
  command(ESC, 0x64, 0x04); // avança 4 linhas
  command(0x0a, 0x0a);

  return new Uint8Array(bytes);
}