import type { CaseRow } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { createQrSvg } from "./qr";
import type { CaseNotePrinterSettings } from "./printer-settings";
import { resolveCaseNotePaper } from "./printer-settings";

type ImplantComponentLine = { tooth: number; text: string };
type StockItemLite = { id: string; name: string | null; brand: string | null; block_type: string | null };

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR").format(date);
}
function caseDisplayNumber(caseRow: CaseRow): string {
  return caseRow.case_number != null ? String(caseRow.case_number) : caseRow.id.replace(/-/g,"").slice(0,8).toUpperCase();
}
function qrPayload(caseRow: CaseRow): string {
  const fallback=`DENTALFLOW:CASE:${caseRow.id}`;
  if(typeof window==="undefined") return fallback;
  try {
    const value=`${window.location.origin}/casos?case=${encodeURIComponent(caseRow.id)}`;
    if(new TextEncoder().encode(value).length<=78) return value;
  } catch {}
  return fallback;
}
function stockItemLabel(item: StockItemLite | undefined): string {
  if(!item) return "Componente não definido";
  const name=(item.name||"Componente").trim();
  const meta=[item.brand,item.block_type].map(v=>v?.trim()).filter((v):v is string=>Boolean(v));
  const unique=meta.filter(part=>!name.toLocaleLowerCase("pt-BR").includes(part.toLocaleLowerCase("pt-BR")));
  return unique.length?`${name} (${unique.join(" - ")})`:name;
}
async function fetchImplantComponentLines(caseRow: CaseRow): Promise<ImplantComponentLine[]> {
  const implantTeeth=[...new Set(caseRow.implant_teeth??[])].sort((a,b)=>a-b);
  if(!implantTeeth.length) return [];
  const {data:usageData}=await supabase.from("case_implant_teeth" as never).select("tooth_fdi,stock_item_id").eq("case_id",caseRow.id).is("reversed_at",null);
  const usages=(usageData??[]) as Array<{tooth_fdi:number;stock_item_id:string|null}>;
  const usageByTooth=new Map(usages.map(row=>[row.tooth_fdi,row.stock_item_id]));
  const tiBases=((caseRow as CaseRow & {tooth_ti_bases?:Record<string,string>|null}).tooth_ti_bases??{}) as Record<string,string>;
  const ids=new Set<string>();
  implantTeeth.forEach(tooth=>{const id=usageByTooth.get(tooth)||tiBases[String(tooth)];if(id)ids.add(id);});
  let itemMap=new Map<string,StockItemLite>();
  if(ids.size){
    const {data,error}=await supabase.from("stock_items").select("id,name,brand,block_type").in("id",[...ids]);
    if(!error)itemMap=new Map(((data??[]) as StockItemLite[]).map(item=>[item.id,item]));
  }
  return implantTeeth.map(tooth=>{const id=usageByTooth.get(tooth)||tiBases[String(tooth)];return {tooth,text:stockItemLabel(id?itemMap.get(id):undefined)};});
}
function buildReferenceLayout(caseRow: CaseRow, settings: CaseNotePrinterSettings, components: ImplantComponentLine[]): string {
  const paper=resolveCaseNotePaper(settings);
  const baseScale=Math.max(.34,Math.min(1.75,paper.continuous ? paper.widthMm/100 : Math.min(paper.widthMm/100,paper.heightMm/170)));
  const density=components.length>8?.88:components.length>5?.94:1;
  const s=baseScale*density;
  const patient=escapeHtml(caseRow.patient?.name||"—"),doctor=escapeHtml(caseRow.doctor?.name||"—"),cadista=escapeHtml(caseRow.cadista?.name||"—");
  const color=escapeHtml(caseRow.tooth_color?.code||"—");
  const elements=[...new Set(caseRow.teeth_numbers??[])].sort((a,b)=>a-b).join(",&#8203;");
  const qr=createQrSvg(qrPayload(caseRow));
  const hasImplants=(caseRow.implant_teeth??[]).length>0;
  const componentRows=hasImplants?components.map(line=>`<div class="component-line"><span>${escapeHtml(line.tooth)}</span> : ${escapeHtml(line.text)}</div>`).join(""):"";
  const pageHeight=paper.continuous ? "auto" : `${paper.heightMm}mm`;
  const continuousClass=paper.continuous ? " continuous" : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css"><title>Guia rápido do caso Nº${escapeHtml(caseDisplayNumber(caseRow))}</title><style id="case-note-page-style">
@page{size:${paper.continuous ? `${paper.widthMm}mm 300mm` : `${paper.widthMm}mm ${paper.heightMm}mm`};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${paper.widthMm}mm;${paper.continuous ? "min-height:1mm" : `height:${paper.heightMm}mm`};background:#fff;color:#000}body{font-family:Inter,Arial,Helvetica,sans-serif;font-feature-settings:"liga" 1,"calt" 1;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{--s:${s};width:${paper.widthMm}mm;height:${pageHeight};padding:calc(3.1mm * var(--s));background:#fff;${paper.continuous ? "" : "overflow:hidden"}}.frame{width:100%;${paper.continuous ? "min-height:1mm" : "height:100%"};border:calc(.28mm * var(--s)) solid #111;padding:calc(5.2mm * var(--s));display:flex;flex-direction:column}.header-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:calc(3.4mm * var(--s));align-items:start}.title{font-size:calc(5.15mm * var(--s));line-height:1.04;font-weight:700;letter-spacing:calc(-.11mm * var(--s));white-space:normal;overflow-wrap:normal;max-width:100%}.case-no{margin-top:calc(1.2mm * var(--s));padding-bottom:calc(1.1mm * var(--s));border-bottom:calc(.24mm * var(--s)) solid #333;font-size:calc(4.15mm * var(--s));line-height:1}.case-no b{font-weight:700}.qr-box{width:calc(25.4mm * var(--s));height:calc(25.4mm * var(--s));padding:calc(1.2mm * var(--s));border:calc(.24mm * var(--s)) solid #222}.qr-box svg{display:block;width:100%;height:100%}.dates{display:grid;grid-template-columns:1fr 1fr;gap:calc(4mm * var(--s));margin-top:calc(3mm * var(--s));font-size:calc(3.55mm * var(--s));line-height:1.05}.date-title{font-size:calc(3.45mm * var(--s));font-weight:700;margin-bottom:calc(.7mm * var(--s))}.date-right{text-align:right}.divider{height:0;border-top:calc(.24mm * var(--s)) solid #333;margin:calc(3.2mm * var(--s)) 0 calc(4.8mm * var(--s))}.info{font-size:calc(3.95mm * var(--s));line-height:1.42;letter-spacing:calc(-.04mm * var(--s))}.info-row{display:block}.info-row strong{font-weight:700}.elements{margin-top:calc(.6mm * var(--s));line-height:1.23;overflow-wrap:anywhere}.section-title{font-size:calc(4mm * var(--s));line-height:1.1;font-weight:700;margin-bottom:calc(2.1mm * var(--s))}.component-list{font-size:calc(3.72mm * var(--s));line-height:1.17}.component-line{overflow-wrap:anywhere}.implant-divider{margin-top:calc(4.6mm * var(--s))}.checklist{font-size:calc(3.72mm * var(--s));line-height:1.12}.checkline{display:flex;gap:calc(1.4mm * var(--s));align-items:flex-start}.box{flex:0 0 auto;white-space:pre}.signature{margin-top:auto;padding-top:calc(5mm * var(--s));font-size:calc(3.75mm * var(--s));line-height:1;white-space:nowrap;display:flex;align-items:flex-end}.signature-line{flex:1;min-width:10mm;border-bottom:calc(.24mm * var(--s)) solid #111;transform:translateY(calc(-.45mm * var(--s)))}@media print{.sheet{break-inside:avoid;page-break-inside:avoid}}
</style></head><body class="${continuousClass.trim()}"><main class="sheet" data-case-note-sheet><section class="frame"><div class="header-grid"><div><div class="title">GUIA RÁPIDO DO CASO</div><div class="case-no"><b>Nº</b>${escapeHtml(caseDisplayNumber(caseRow))}</div><div class="dates"><div><div class="date-title">Entrada</div><div>${escapeHtml(fmtDate(caseRow.entry_date))}</div></div><div class="date-right"><div class="date-title">Entrega</div><div>${escapeHtml(fmtDate(caseRow.delivery_date))}</div></div></div></div><div class="qr-box">${qr}</div></div><div class="divider"></div><section class="info"><div class="info-row">Paciente : <strong>${patient}</strong></div><div class="info-row">Doutor : <strong>${doctor}</strong></div><div class="info-row">Cadista : <strong>${cadista}</strong></div><div class="info-row">Cor : <strong>${color}</strong></div><div class="info-row elements">Elementos : <strong>${elements||"—"}</strong></div></section>
${hasImplants?`<div class="divider"></div><section><div class="section-title">Componentes por Elemento</div><div class="component-list">${componentRows}</div></section><div class="divider implant-divider"></div>`:`<div class="divider"></div>`}
<section><div class="section-title">Checklist do Laboratório</div><div class="checklist"><div class="checkline"><span class="box">[ ]</span><span>Modelos Prontos e com Análogos</span></div><div class="checkline"><span class="box">[ ]</span><span>Componentes Separados</span></div><div class="checkline"><span class="box">[ ]</span><span>Elementos Finalizados</span></div><div class="checkline"><span class="box">[ ]</span><span>Modelos, elementos e componentes conferidos e testados.</span></div></div></section><div class="signature"><span>TPD Responsável</span><span class="signature-line"></span></div></section></main></body></html>`;
}
export async function buildCaseNoteSystemHtml(caseRow:CaseRow,settings:CaseNotePrinterSettings):Promise<string>{
  const components=(caseRow.implant_teeth??[]).length?await fetchImplantComponentLines(caseRow).catch(()=>[...new Set(caseRow.implant_teeth??[])].sort((a,b)=>a-b).map(tooth=>({tooth,text:"Componente não definido"}))):[];
  return buildReferenceLayout(caseRow,settings,components);
}
export async function printCaseNoteSystem(caseRow:CaseRow,settings:CaseNotePrinterSettings):Promise<void>{
  const html=await buildCaseNoteSystemHtml(caseRow,settings);
  const iframe=document.createElement("iframe");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.cssText="position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  try{
    const doc=iframe.contentDocument;
    if(!doc)throw new Error("Não foi possível preparar a nota para impressão.");
    doc.open();doc.write(html);doc.close();
    await new Promise<void>(resolve=>{if(doc.readyState==="complete")return resolve();iframe.addEventListener("load",()=>resolve(),{once:true});window.setTimeout(resolve,350);});
    try { await doc.fonts?.ready; } catch {}
    if (settings.paperId === "continuous") {
      const sheet = doc.querySelector<HTMLElement>("[data-case-note-sheet]");
      const pageStyle = doc.getElementById("case-note-page-style");
      if (sheet && pageStyle) {
        // CSS pixels are defined as 96 dpi. Add a tiny feed margin so the last
        // thermal row is never clipped by the driver/cutter.
        const measuredMm = Math.max(40, Math.ceil((sheet.scrollHeight * 25.4 / 96 + 2) * 10) / 10);
        sheet.style.height = measuredMm + "mm";
        doc.documentElement.style.height = measuredMm + "mm";
        doc.body.style.height = measuredMm + "mm";
        pageStyle.textContent += `\n@page{size:${resolveCaseNotePaper(settings).widthMm}mm ${measuredMm}mm;margin:0}`;
      }
    }
    await new Promise(resolve=>window.setTimeout(resolve,100));
    const printWindow=iframe.contentWindow;
    if(!printWindow)throw new Error("Janela de impressão indisponível.");
    printWindow.focus();printWindow.print();
  }finally{window.setTimeout(()=>iframe.remove(),60000);}
}
