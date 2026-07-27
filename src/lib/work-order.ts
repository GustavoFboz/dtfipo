/**
 * Work-order (Ordem de Serviço) renderer for a case.
 *
 * Builds a self-contained printable HTML element that mirrors the system's
 * visual identity (azul #1F8AFF, fontes Google Sans, layout do dialog).
 * Used both to:
 *   - imprimir diretamente (printWorkOrder)
 *   - gerar PDF para incluir no ZIP do caso (getWorkOrderPdfBlob)
 */
import svgRawSource from "@/assets/arcada.svg?raw";
import type { CaseRow } from "@/lib/types";
import { sortTeeth } from "@/lib/teeth";
import { IMPLANT_COLOR_SCALE } from "@/components/TeethSelector";
import { supabase } from "@/integrations/supabase/client";

export type ImplantUsageLine = { tooth: number; system: string; component: string };

async function fetchImplantUsageLines(caseRow: CaseRow): Promise<ImplantUsageLine[]> {
  const implantTeeth = (caseRow.implant_teeth ?? []).slice().sort((a, b) => a - b);
  const toothSys = (caseRow.tooth_implant_systems ?? {}) as Record<string, string>;

  const { data: usages } = await supabase
    .from("case_implant_teeth" as never)
    .select("tooth_fdi, stock_item_id, implant_system_id")
    .eq("case_id", caseRow.id)
    .is("reversed_at", null);
  const rows = (usages ?? []) as Array<{ tooth_fdi: number; stock_item_id: string; implant_system_id: string }>;

  // Collect every system/stock id we may need to resolve.
  const sysIds = new Set<string>();
  const stockIds = new Set<string>();
  rows.forEach((r) => { sysIds.add(r.implant_system_id); stockIds.add(r.stock_item_id); });
  Object.values(toothSys).forEach((id) => { if (id) sysIds.add(id); });
  if (caseRow.implant_system?.id) sysIds.add(caseRow.implant_system.id);

  const [itemsRes, systemsRes] = await Promise.all([
    stockIds.size ? supabase.from("stock_items").select("id, name").in("id", [...stockIds]) : Promise.resolve({ data: [] }),
    sysIds.size ? supabase.from("implant_systems").select("id, name").in("id", [...sysIds]) : Promise.resolve({ data: [] }),
  ]);
  const itemMap = new Map(((itemsRes.data as Array<{ id: string; name: string }> | null) ?? []).map((i) => [i.id, i.name]));
  const sysMap = new Map(((systemsRes.data as Array<{ id: string; name: string }> | null) ?? []).map((s) => [s.id, s.name]));

  const byTooth = new Map<number, ImplantUsageLine>();
  // Placeholder row for every implant tooth in the case.
  for (const t of implantTeeth) {
    const sysId = toothSys[String(t)] ?? caseRow.implant_system?.id ?? "";
    byTooth.set(t, {
      tooth: t,
      system: (sysId && sysMap.get(sysId)) || caseRow.implant_system?.name || "—",
      component: "— a definir",
    });
  }
  // Overwrite with real usages when they exist.
  for (const r of rows) {
    byTooth.set(r.tooth_fdi, {
      tooth: r.tooth_fdi,
      system: sysMap.get(r.implant_system_id) ?? "—",
      component: itemMap.get(r.stock_item_id) ?? "—",
    });
  }
  return [...byTooth.values()].sort((a, b) => a.tooth - b.tooth);
}

// Same neutralization performed by TeethSelector at module load.
const svgRaw = svgRawSource
  .replace(/\.fil3\s*\{fill:#FF8300\}/i, ".fil3 {fill:#FFFFFF}")
  .replace(/\.fil5\s*\{fill:#0C84FA\}/i, ".fil5 {fill:#FFFFFF}")
  .replace(/\.fil4\s*\{fill:white;fill-rule:nonzero\}/i, ".fil4 {fill:#828C9A;fill-rule:nonzero}");

const VALID_TEETH = new Set([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]);

function parseToothNumber(id: string): number | null {
  const decoded = id.replace(/_x[0-9a-f]{4}_/gi, " ");
  const matches = decoded.match(/\d+/g) ?? [];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const n = parseInt(matches[i], 10);
    if (VALID_TEETH.has(n)) return n;
  }
  return null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

/** Paint the arcada SVG inside `host` with the case's colored teeth + implants. */
function paintArch(
  host: HTMLElement,
  opts: {
    selected: number[];
    zirconia: number[];
    dissilicato: number[];
    enceramentoOnly: number[];
    implants: number[];
    implantColor: string;
    assigned?: number[];
  },
) {
  const selected = new Set(opts.selected);
  const zir = new Set(opts.zirconia);
  const dis = new Set(opts.dissilicato);
  const enc = new Set(opts.enceramentoOnly);
  const imp = new Set(opts.implants);
  // Um dente é "atribuído" quando possui zirconia, dissilicato, implante ou
  // qualquer configuração explícita informada pelo chamador. Sem isso, cai
  // para o comportamento antigo (todo selecionado conta como atribuído).
  const assigned = new Set(
    opts.assigned ?? [...selected].filter((n) => zir.has(n) || dis.has(n) || enc.has(n) || imp.has(n)),
  );

  const svg = host.querySelector<SVGSVGElement>("svg");
  if (!svg) return;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";
  svg.querySelectorAll<SVGElement>("*").forEach((el) => {
    el.style.stroke = "none";
    el.style.strokeWidth = "0";
    el.removeAttribute("stroke");
    el.removeAttribute("stroke-width");
  });
  // Hide ALL Sinal markers globally (pending indicators do not belong on the OS).
  svg.querySelectorAll<SVGElement>('[id^="Sinal" i], [id^="sinal" i]').forEach((el) => {
    el.style.fill = "transparent";
    el.style.fillOpacity = "0";
    el.style.display = "none";
  });

  const groups = host.querySelectorAll<SVGGElement>("g[id]");
  groups.forEach((g) => {
    const n = parseToothNumber(g.id);
    if (n === null) return;

    // Built-in implant circle inside the tooth group (mesma abordagem da arcada de trabalho).
    const implantEl = g.querySelector<SVGElement>('[id^="Implante" i], [id^="implante" i]');

    // Default: quieter neutral so unselected teeth read as background.
    let fill = "#F1F5F9";
    let textColor = "#94A3B8";
    if (zir.has(n)) { fill = "#B319E6"; textColor = "#FFFFFF"; }
    else if (dis.has(n)) { fill = "#FF8300"; textColor = "#FFFFFF"; }
    else if (enc.has(n)) { fill = "#5EEAD4"; textColor = "#083F3A"; }
    else if (selected.has(n) && assigned.has(n)) { fill = "#1F8AFF"; textColor = "#FFFFFF"; }

    g.querySelectorAll<SVGElement>("path, polygon, circle, ellipse, rect, text, tspan").forEach((el) => {
      if (implantEl && el === implantEl) return;
      const tag = el.tagName.toLowerCase();
      const idLower = (el.id || "").toLowerCase();
      // Hide "Sinal" (pending marker) elements entirely on the OS.
      if (idLower.startsWith("sinal")) {
        el.style.fill = "transparent";
        el.style.fillOpacity = "0";
        el.style.stroke = "none";
        return;
      }
      const isDigit =
        el.classList.contains("fil2") ||
        el.classList.contains("fil3") ||
        el.classList.contains("fil4") ||
        idLower.startsWith("numero") ||
        tag === "text" || tag === "tspan";
      const isTooth =
        el.classList.contains("fil1") ||
        el.classList.contains("fil5") ||
        idLower.startsWith("basedente") ||
        (idLower.startsWith("dente") && tag !== "g");
      if (isDigit) el.style.fill = textColor;
      else if (isTooth) el.style.fill = fill;
    });

    // Círculo de implante embutido: preto 60% para dentes selecionados marcados como implante.
    if (implantEl) {
      const isImp = imp.has(n) && (selected.has(n) || assigned.has(n));
      implantEl.style.fill = isImp ? "#000000" : "#FFFFFF";
      implantEl.style.fillOpacity = isImp ? "0.6" : "0";
    }
  });
}

/** Render the full HTML string of the work order (no <html> wrapper). */
export function buildWorkOrderHtml(caseRow: CaseRow, implantUsages: ImplantUsageLine[] = []): string {
  const patient = caseRow.patient?.name ?? "—";
  const types = (caseRow.case_types_link ?? [])
    .map((l) => l.case_type?.name)
    .filter(Boolean) as string[];
  const teeth = sortTeeth(caseRow.teeth_numbers ?? []);
  const implants = caseRow.implant_teeth ?? [];
  const overdue =
    !caseRow.finished_at && new Date(caseRow.delivery_date + "T23:59:59").getTime() < Date.now();

  // Design tokens — minimalismo alto padrão. Uma tinta, um acento discreto.
  const C = {
    ink: "#0F172A",
    inkSoft: "#334155",
    muted: "#64748B",
    hair: "#E6ECF3",
    accent: "#1F8AFF",
    danger: "#B91C1C",
    zir: "#B319E6",
    dis: "#FF8300",
  };
  const hasZir = (caseRow.teeth_zirconia ?? []).length > 0;
  const hasDis = (caseRow.teeth_dissilicato ?? []).length > 0;
  const hasImp = implants.length > 0;
  const stageName =
    (typeof caseRow.current_stage === "object" && caseRow.current_stage
      ? (caseRow.current_stage as { name?: string }).name
      : (caseRow.current_stage as unknown as string)) || "—";
  const caseNumber = caseRow.case_number != null ? `#${caseRow.case_number}` : `#${caseRow.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  const sectionLabel = (text: string) =>
    `<div style="font-size:8.5px;letter-spacing:1.6px;color:${C.muted};font-weight:600;text-transform:uppercase;margin-bottom:10px">${text}</div>`;

  const kv = (label: string, value: string) => `
    <div style="display:flex;gap:10px;padding:7px 0;font-size:10.5px;line-height:1.4">
      <div style="color:${C.muted};font-weight:400;min-width:96px">${label}</div>
      <div style="color:${C.ink};flex:1;font-weight:500">${value || "—"}</div>
    </div>`;

  const legend: string[] = [];
  if (hasZir) legend.push(`<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:999px;background:${C.zir}"></span>Zircônia</span>`);
  if (hasDis) legend.push(`<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:999px;background:${C.dis}"></span>Dissilicato</span>`);
  if (hasImp) legend.push(`<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:999px;background:${IMPLANT_COLOR_SCALE[0]};color:#fff;font-size:8px;font-weight:700;font-style:italic;line-height:1">i</span>Implante</span>`);

  return `
  <div id="wo-root" style="font-family:'Inter','Google Sans Text',system-ui,sans-serif;width:794px;height:1123px;background:#FFFFFF;color:${C.ink};padding:44px 56px 40px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px;-webkit-font-smoothing:antialiased;letter-spacing:-.005em;overflow:hidden">

    <!-- HEADER -->
    <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:20px;border-bottom:1px solid ${C.hair}">
      <div style="min-width:0">
        <div style="font-size:9px;letter-spacing:2px;color:${C.muted};font-weight:600;text-transform:uppercase">Ordem de Serviço · ${caseNumber}</div>
        <div style="font-size:28px;font-weight:600;color:${C.ink};margin-top:6px;letter-spacing:-.02em;line-height:1.1">${patient}</div>
        <div style="font-size:11px;color:${C.muted};margin-top:6px;font-weight:400">${types.length ? types.join(" · ") : "Sem tipo definido"}${caseRow.has_provisional ? " · Provisório" : ""}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:9px;letter-spacing:1.4px;color:${C.muted};font-weight:600;text-transform:uppercase">Emitido</div>
        <div style="font-size:11px;color:${C.ink};margin-top:4px;font-weight:500">${new Date().toLocaleString("pt-BR")}</div>
      </div>
    </header>

    <!-- ARCADA — grande, respirando -->
    <section>
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
        ${sectionLabel("Arcada")}
        <div style="font-size:8.5px;letter-spacing:1.6px;color:${C.muted};font-weight:600;text-transform:uppercase">Notação FDI</div>
      </div>
      <div id="wo-arch" style="width:100%;height:460px;display:flex;align-items:center;justify-content:center">${svgRaw}</div>
      ${legend.length ? `<div style="display:flex;flex-wrap:wrap;gap:20px;font-size:10px;color:${C.inkSoft};margin-top:14px;justify-content:center;font-weight:500">${legend.join("")}</div>` : ""}
      ${teeth.length ? `<div style="text-align:center;margin-top:10px;font-size:10.5px;color:${C.muted}"><span style="color:${C.ink};font-weight:600">${teeth.length} elemento(s)</span> · ${teeth.join(" · ")}</div>` : ""}
    </section>

    <!-- INFORMAÇÕES em duas colunas -->
    <section style="display:grid;grid-template-columns:1fr 1fr;gap:40px;padding-top:20px;border-top:1px solid ${C.hair}">
      <div>
        ${sectionLabel("Informações")}
        ${kv("Dentista", caseRow.doctor?.name ?? "—")}
        ${kv("Cadista", caseRow.cadista?.name ?? "—")}
        ${kv("Cor do dente", caseRow.tooth_color?.code ?? "—")}
        ${kv("Sist. implantes", caseRow.implant_system?.name ?? "—")}
        ${kv("Scanbody", caseRow.scan_jig?.name ?? "—")}
      </div>
      <div>
        ${sectionLabel("Datas & etapa")}
        ${kv("Entrada", fmtDate(caseRow.entry_date))}
        ${kv("Entrega", `<span style="color:${overdue ? C.danger : C.ink};font-weight:${overdue ? 600 : 500}">${fmtDate(caseRow.delivery_date)}${overdue ? " · atrasado" : ""}</span>`)}
        ${kv("Etapa atual", `${stageName}${caseRow.finished_at ? ` · finalizado ${fmtDate(caseRow.finished_at)}` : ""}`)}
        ${kv("Provisório", caseRow.has_provisional ? "Sim" : "Não")}
      </div>
    </section>

    ${hasImp ? `
    <!-- COMPONENTES DO IMPLANTE -->
    <section style="padding-top:20px;border-top:1px solid ${C.hair}">
      ${sectionLabel("Componentes do implante")}
      <div style="display:flex;flex-direction:column">
        <div style="display:grid;grid-template-columns:56px 1fr 1.2fr;gap:16px;font-size:8.5px;letter-spacing:1.4px;color:${C.muted};font-weight:600;text-transform:uppercase;padding:6px 0;border-bottom:1px solid ${C.hair}">
          <div>Dente</div><div>Sistema</div><div>Componente</div>
        </div>
        ${(implantUsages.length ? implantUsages : implants.slice().sort((a,b)=>a-b).map((t) => ({ tooth: t, system: caseRow.implant_system?.name ?? "—", component: "— a definir" })))
          .map((u) => `
            <div style="display:grid;grid-template-columns:56px 1fr 1.2fr;gap:16px;font-size:11px;line-height:1.4;padding:9px 0;border-bottom:1px solid ${C.hair}">
              <div style="color:${C.accent};font-weight:700">${u.tooth}</div>
              <div style="color:${C.ink};font-weight:500">${u.system}</div>
              <div style="color:${u.component.startsWith("—") ? C.muted : C.ink};font-weight:${u.component.startsWith("—") ? 400 : 500};font-style:${u.component.startsWith("—") ? "italic" : "normal"}">${u.component}</div>
            </div>`).join("")}
      </div>
    </section>` : ""}

    ${((caseRow.case_label ?? "").trim() || (caseRow.notes ?? "").trim()) ? `
    <section style="padding-top:20px;border-top:1px solid ${C.hair};display:grid;grid-template-columns:1fr 1fr;gap:40px">
      <div>
        ${sectionLabel("Detalhes do caso")}
        <div style="font-size:10.5px;color:${C.inkSoft};white-space:pre-wrap;line-height:1.55">${(caseRow.case_label ?? "").trim() || "—"}</div>
      </div>
      <div>
        ${sectionLabel("Observações")}
        <div style="font-size:10.5px;color:${C.inkSoft};white-space:pre-wrap;line-height:1.55">${(caseRow.notes ?? "").trim() || "—"}</div>
      </div>
    </section>` : ""}

    <footer style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:20px;border-top:1px solid ${C.hair};font-size:9.5px;color:${C.muted};font-weight:500">
      <div>Protético responsável · <span style="color:${C.ink};font-weight:600">${caseRow.cadista?.name ?? caseRow.doctor?.name ?? "—"}</span></div>
      <div style="letter-spacing:.4px">DentalFlow Pro · ${new Date().getFullYear()}</div>
    </footer>
  </div>`;
}

/**
 * Mount the OS inside an ISOLATED iframe so the app's stylesheet (Tailwind v4
 * uses `oklch()` color tokens which html2canvas cannot parse) does not bleed
 * in. Returns the root element of the OS plus a cleanup function.
 */
function mountInIframe(caseRow: CaseRow, usages: ImplantUsageLine[]): Promise<{ el: HTMLElement; iframe: HTMLIFrameElement; cleanup: () => void }> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    // Must be visible-sized (not 0x0) for html2canvas to measure correctly.
    iframe.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;height:1123px;border:0;background:#fff";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">
      <style>html,body{margin:0;padding:0;background:#fff;color:#0F172A}</style>
      </head><body>${buildWorkOrderHtml(caseRow, usages)}</body></html>`);
    doc.close();
    const finish = () => {
      const root = doc.body.firstElementChild as HTMLElement;
      const archHost = doc.querySelector<HTMLElement>("#wo-arch");
      if (archHost) {
        paintArch(archHost, {
          selected: caseRow.teeth_numbers ?? [],
          zirconia: caseRow.teeth_zirconia ?? [],
          dissilicato: caseRow.teeth_dissilicato ?? [],
          enceramentoOnly: encOnlyTeethFromCase(caseRow),
          implants: caseRow.implant_teeth ?? [],
          implantColor: IMPLANT_COLOR_SCALE[0],
          assigned: assignedTeethFromCase(caseRow),
        });
      }
      resolve({ el: root, iframe, cleanup: () => iframe.remove() });
    };
    if (doc.readyState === "complete") finish();
    else iframe.addEventListener("load", finish, { once: true });
  });
}

function assignedTeethFromCase(caseRow: CaseRow): number[] {
  const set = new Set<number>();
  (caseRow.teeth_zirconia ?? []).forEach((n) => set.add(n));
  (caseRow.teeth_dissilicato ?? []).forEach((n) => set.add(n));
  (caseRow.implant_teeth ?? []).forEach((n) => set.add(n));
  const tct = (caseRow.tooth_case_types ?? {}) as Record<string, string[]>;
  for (const [k, v] of Object.entries(tct)) if (v?.[0]) set.add(Number(k));
  return [...set];
}

function encOnlyTeethFromCase(caseRow: CaseRow): number[] {
  const teeth = caseRow.teeth_numbers ?? [];
  const zir = caseRow.teeth_zirconia ?? [];
  const dis = caseRow.teeth_dissilicato ?? [];
  const imp = caseRow.implant_teeth ?? [];
  const tct = (caseRow.tooth_case_types ?? {}) as Record<string, string[]>;
  return teeth.filter((t) => {
    const arr = tct[String(t)] ?? [];
    const hasEnc = arr.includes("enceramento");
    const hasPrimary = arr.some((x) => x && x !== "enceramento");
    return hasEnc && !hasPrimary && !zir.includes(t) && !dis.includes(t) && !imp.includes(t);
  });
}

/** Render OS to a PDF blob (A4 portrait, 1 page). */
export async function getWorkOrderPdfBlob(caseRow: CaseRow): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");
  const usages = await fetchImplantUsageLines(caseRow).catch(() => []);
  const { el, iframe, cleanup } = await mountInIframe(caseRow, usages);
  try {
    // Give SVG/layout a tick to settle.
    await new Promise((r) => setTimeout(r, 80));
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 794,
      windowHeight: 1123,
      foreignObjectRendering: false,
    });
    void iframe;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const img = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(img, "JPEG", 0, 0, pageW, pageH);
    return pdf.output("blob");
  } finally {
    cleanup();
  }
}

/** Open print dialog with the rendered OS — uses an isolated iframe to keep app UI intact. */
export async function printWorkOrder(caseRow: CaseRow): Promise<void> {
  const usages = await fetchImplantUsageLines(caseRow).catch(() => []);
  const html = buildWorkOrderHtml(caseRow, usages);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ordem de Serviço</title>
    <style>@page{size:A4;margin:0} html,body{margin:0;padding:0;background:#fff}</style>
  </head><body>${html}</body></html>`);
  doc.close();

  // Paint arch inside the iframe DOM.
  const archHost = doc.querySelector<HTMLElement>("#wo-arch");
  if (archHost) {
    paintArch(archHost, {
      selected: caseRow.teeth_numbers ?? [],
      zirconia: caseRow.teeth_zirconia ?? [],
      dissilicato: caseRow.teeth_dissilicato ?? [],
      enceramentoOnly: encOnlyTeethFromCase(caseRow),
      implants: caseRow.implant_teeth ?? [],
      implantColor: IMPLANT_COLOR_SCALE[0],
      assigned: assignedTeethFromCase(caseRow),
    });
  }

  // Wait for layout, then print.
  await new Promise((r) => setTimeout(r, 150));
  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (e) {
    console.error("print failed", e);
  }
  // Remove after the print dialog closes (give it generous time).
  setTimeout(() => iframe.remove(), 60_000);
}
