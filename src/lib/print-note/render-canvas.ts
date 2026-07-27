/**
 * Render the printable note onto a monochrome canvas suitable for thermal printers
 * (58mm = 384px, 80mm = 576px @ 203dpi). Uses Inter (já carregada na app).
 */
import type { CaseRow } from "@/lib/types";
import type { PrintNoteTemplate } from "./types";
import { buildInterpolateContext, fieldValue, interpolate, visibleFields } from "./context";

export function widthForPaper(paper: PrintNoteTemplate["paper"]): number {
  if (paper === "80mm") return 576;
  if (paper === "a4") return 800;
  return 384;
}

type RenderResult = { canvas: HTMLCanvasElement; width: number; height: number };

export function renderNoteCanvas(c: CaseRow, tpl: PrintNoteTemplate): RenderResult {
  const W = widthForPaper(tpl.paper);
  const PAD = 16;
  const ctx0 = document.createElement("canvas").getContext("2d")!;
  const ctx = ctx0;

  // First pass: measure → second pass: draw
  const lines: Array<() => number> = []; // each returns height consumed
  let y = PAD;

  const ictx = buildInterpolateContext(c);
  const title = interpolate(tpl.header.title || "", ictx).trim();
  const subtitle = interpolate(tpl.header.subtitle || "", ictx).trim();
  const footer = interpolate(tpl.footer || "", ictx).trim();
  const fields = visibleFields(tpl.fields);

  const setFont = (weight: number, size: number) => {
    ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  };

  function wrap(text: string, maxW: number, size: number, weight: number): string[] {
    setFont(weight, size);
    const words = text.split(/\s+/);
    const out: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  // Measure pass — tamanhos generosos: térmica 203dpi precisa de ≥16px pra ler bem.
  const is58 = tpl.paper === "58mm";
  const titleSize = is58 ? 34 : 42;
  const subtitleSize = is58 ? 18 : 20;
  const labelSize = is58 ? 16 : 18;
  const valueSize = is58 ? 26 : 30;
  const checklistSize = is58 ? 24 : 26;
  const footerSize = is58 ? 18 : 20;
  const checklistBox = checklistSize + 4;
  const titleLines = wrap(title || "—", W - PAD * 2, titleSize, 800);
  const subtitleLines = subtitle ? wrap(subtitle, W - PAD * 2, subtitleSize, 500) : [];

  let H = PAD;
  H += 6; // top bar
  H += 10;
  H += titleLines.length * (titleSize + 6);
  if (subtitleLines.length) H += 6 + subtitleLines.length * (subtitleSize + 4);
  H += 16; // divider gap

  for (const f of fields) {
    const val = fieldValue(c, f.key);
    const valLines = wrap(val, W - PAD * 2, valueSize, 700);
    H += labelSize + 4 + valLines.length * (valueSize + 4) + 10;
  }

  if (tpl.checklist.length) {
    H += 16; // divider
    H += labelSize + 8; // section label
    for (const item of tpl.checklist) {
      const wlines = wrap(item, W - PAD * 2 - checklistBox - 12, checklistSize, 600);
      H += Math.max(checklistBox, wlines.length * (checklistSize + 6)) + 10;
    }
  }

  if (footer) H += 16 + footerSize + 4;
  H += PAD;

  // Draw pass
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(H);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#000000";
  g.textBaseline = "top";

  // Top accent bar
  g.fillRect(PAD, y, 56, 6);
  y += 6 + 12;

  // Title
  g.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
  for (const ln of titleLines) {
    g.fillText(ln, PAD, y);
    y += titleSize + 6;
  }

  // Subtitle
  if (subtitleLines.length) {
    y += 2;
    g.font = `500 ${subtitleSize}px Inter, system-ui, sans-serif`;
    g.fillStyle = "#000";
    for (const ln of subtitleLines) {
      g.fillText(ln, PAD, y);
      y += subtitleSize + 4;
    }
  }

  // Divider
  y += 10;
  g.fillRect(PAD, y, W - PAD * 2, 2);
  y += 8;
  void lines;

  // Fields
  for (const f of fields) {
    const val = fieldValue(c, f.key);
    g.font = `600 ${labelSize}px Inter, system-ui, sans-serif`;
    const label = f.label.toUpperCase();
    g.fillText(label, PAD, y);
    y += labelSize + 4;
    g.font = `700 ${valueSize}px Inter, system-ui, sans-serif`;
    const valLines = wrap(val, W - PAD * 2, valueSize, 700);
    for (const ln of valLines) {
      g.fillText(ln, PAD, y);
      y += valueSize + 4;
    }
    y += 10;
  }

  // Checklist
  if (tpl.checklist.length) {
    y += 6;
    g.fillRect(PAD, y, W - PAD * 2, 2);
    y += 10;
    g.font = `700 ${labelSize}px Inter, system-ui, sans-serif`;
    g.fillText("CHECKLIST", PAD, y);
    y += labelSize + 8;
    for (const item of tpl.checklist) {
      const boxY = y;
      // Empty checkbox (2px border)
      g.lineWidth = 2;
      g.strokeStyle = "#000";
      g.strokeRect(PAD + 1, boxY + 1, checklistBox, checklistBox);
      g.font = `600 ${checklistSize}px Inter, system-ui, sans-serif`;
      const textX = PAD + checklistBox + 10;
      const wlines = wrap(item, W - PAD * 2 - checklistBox - 12, checklistSize, 600);
      let ly = y + 2;
      for (const ln of wlines) {
        g.fillText(ln, textX, ly);
        ly += checklistSize + 6;
      }
      y += Math.max(checklistBox, wlines.length * (checklistSize + 6)) + 10;
    }
  }

  // Footer
  if (footer) {
    y += 8;
    g.fillRect(PAD, y, W - PAD * 2, 2);
    y += 8;
    g.font = `500 ${footerSize}px Inter, system-ui, sans-serif`;
    g.fillStyle = "#000";
    g.fillText(footer, PAD, y);
  }

  // Threshold to pure black/white for thermal
  if (tpl.paper !== "a4") {
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const bw = v < 190 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = bw;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  return { canvas, width: canvas.width, height: canvas.height };
}
