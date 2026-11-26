import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { StockCategory, StockItemV2 } from "@/lib/stock-v2";
import { isDentalFlowWindowsDesktop, saveDesktopPdf } from "@/lib/desktop-local";
import { isNativeMobileApp, printHtmlNative, savePdfNative } from "@/lib/mobile/native";

export type StockReportConfig = {
  categoryId: string | "all";
  query: string;
  brand: string;
  type: string;
  status: "all" | "attention" | "below_min" | "out";
  sortBy: "name" | "brand" | "qty" | "replenishment";
  sortDir: "asc" | "desc";
  orientation: "portrait" | "landscape";
  includeCustomFields: boolean;
  includeNotes: boolean;
};

export const DEFAULT_STOCK_REPORT_CONFIG: StockReportConfig = {
  categoryId: "all", query: "", brand: "", type: "", status: "all",
  sortBy: "name", sortDir: "asc", orientation: "portrait",
  includeCustomFields: false, includeNotes: false,
};

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const norm = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase("pt-BR");
const esc = (v: unknown) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const date = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-BR");
};

export function stockReplenishmentNeed(item: Pick<StockItemV2,"qty_on_hand"|"min_qty">) {
  return Math.max(0, n(item.min_qty) - n(item.qty_on_hand));
}

export function stockReportStatus(item: Pick<StockItemV2,"qty_on_hand"|"min_qty">) {
  const q=n(item.qty_on_hand), m=n(item.min_qty);
  if(q<=0 && m>0) return {key:"out",label:"Sem estoque"};
  if(m>0 && q<m) return {key:"below",label:"Abaixo do mínimo"};
  if(m>0 && q===m) return {key:"limit",label:"No limite mínimo"};
  return {key:"ok",label:"Adequado"};
}

export function filterStockReportItems(items: StockItemV2[], cfg: StockReportConfig) {
  const q=norm(cfg.query), brand=norm(cfg.brand), type=norm(cfg.type);
  const rows=items.filter(item=>{
    if(cfg.categoryId!=="all" && item.category_id!==cfg.categoryId) return false;
    if(q){
      const custom=(item.custom_fields??[]).map(f=>`${f.key} ${f.value??""}`).join(" ");
      if(!norm([item.name,item.brand,item.type,item.notes,custom].filter(Boolean).join(" ")).includes(q)) return false;
    }
    if(brand && norm(item.brand)!==brand) return false;
    if(type && norm(item.type)!==type) return false;
    const qty=n(item.qty_on_hand), min=n(item.min_qty);
    if(cfg.status==="attention" && !(min>0 && qty<=min)) return false;
    if(cfg.status==="below_min" && !(min>0 && qty<min)) return false;
    if(cfg.status==="out" && qty>0) return false;
    return true;
  });
  const dir=cfg.sortDir==="asc"?1:-1;
  return [...rows].sort((a,b)=>{
    const av=cfg.sortBy==="qty"?n(a.qty_on_hand):cfg.sortBy==="replenishment"?stockReplenishmentNeed(a):cfg.sortBy==="brand"?norm(a.brand):norm(a.name);
    const bv=cfg.sortBy==="qty"?n(b.qty_on_hand):cfg.sortBy==="replenishment"?stockReplenishmentNeed(b):cfg.sortBy==="brand"?norm(b.brand):norm(b.name);
    return (typeof av==="number"&&typeof bv==="number" ? av-bv : String(av).localeCompare(String(bv),"pt-BR",{numeric:true}))*dir;
  });
}

export function summarizeStockReport(rows: StockItemV2[], categories: StockCategory[], cfg: StockReportConfig){
  return {
    total: rows.length,
    attention: rows.filter(i=>n(i.min_qty)>0&&n(i.qty_on_hand)<=n(i.min_qty)).length,
    below: rows.filter(i=>n(i.min_qty)>0&&n(i.qty_on_hand)<n(i.min_qty)).length,
    out: rows.filter(i=>n(i.qty_on_hand)<=0).length,
    category: cfg.categoryId==="all"?"Todo o estoque":categories.find(c=>c.id===cfg.categoryId)?.name??"Categoria selecionada",
  };
}

const custom=(i:StockItemV2)=> (i.custom_fields??[]).filter(f=>f.key.trim()).map(f=>`${f.key}: ${f.value??"—"}`).join(" · ");
const material=(i:StockItemV2,cfg:StockReportConfig)=>{
  const extra:string[]=[];
  if(cfg.includeCustomFields&&custom(i)) extra.push(custom(i));
  if(cfg.includeNotes&&i.notes?.trim()) extra.push(`Obs.: ${i.notes.trim()}`);
  return extra.length?`${i.name}\n${extra.join("\n")}`:i.name;
};
const filename=(label:string)=>`Relatorio-Estoque-${label.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"Estoque"}-${new Date().toISOString().slice(0,10)}.pdf`;

function pdf(rows:StockItemV2[], categories:StockCategory[], cfg:StockReportConfig){
  const s=summarizeStockReport(rows,categories,cfg);
  const doc=new jsPDF({orientation:cfg.orientation,unit:"mm",format:"a4"});
  const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight(),m=14,now=new Date();
  doc.setFont("helvetica","bold");doc.setFontSize(17);doc.setTextColor(23,37,61);doc.text("DENTALFLOW",m,18);
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(116,126,145);doc.text("Gestão inteligente de estoque",m,23.5);
  doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(23,37,61);doc.text("RELATÓRIO DE ESTOQUE",w-m,18,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(116,126,145);doc.text(s.category,w-m,23.5,{align:"right"});
  doc.text(`Emitido em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`,w-m,28,{align:"right"});
  doc.setDrawColor(230,235,242);doc.line(m,33,w-m,33);
  const y=39,ch=18,g=3,cw=(w-m*2-g*3)/4;
  [["Itens no relatório",s.total],["Atenção",s.attention],["Abaixo do mínimo",s.below],["Zerados",s.out]].forEach(([label,value],idx)=>{
    const x=m+idx*(cw+g);doc.setFillColor(248,250,253);doc.roundedRect(x,y,cw,ch,2,2,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(idx===0?84:23,idx===0?168:37,idx===0?251:61);doc.text(String(value),x+4,y+7);
    doc.setFont("helvetica","normal");doc.setFontSize(7.2);doc.setTextColor(116,126,145);doc.text(String(label),x+4,y+13);
  });
  const cat=new Map(categories.map(c=>[c.id,c.name]));
  const body=rows.map(i=>[material(i,cfg),cat.get(i.category_id??"")??"—",[i.brand,i.type].filter(Boolean).join(" · ")||"—",`${n(i.qty_on_hand)} ${i.unit||""}`,`${n(i.min_qty)} ${i.unit||""}`,`${stockReplenishmentNeed(i)} ${i.unit||""}`,stockReportStatus(i).label,date(i.last_restocked_at)]);
  autoTable(doc,{startY:y+ch+7,head:[["Material","Categoria","Marca / tipo","Atual","Mín.","Repor","Situação","Últ. reposição"]],body,theme:"plain",
    styles:{font:"helvetica",fontSize:cfg.orientation==="landscape"?7.4:7,cellPadding:2.4,textColor:[58,68,85],lineColor:[234,238,244],lineWidth:.18,valign:"middle",overflow:"linebreak"},
    headStyles:{fillColor:[245,248,252],textColor:[72,87,108],fontStyle:"bold",lineColor:[228,234,242],lineWidth:.2},
    alternateRowStyles:{fillColor:[252,253,255]},margin:{left:m,right:m,bottom:16},
    columnStyles:cfg.orientation==="landscape"?{0:{cellWidth:52},1:{cellWidth:34},2:{cellWidth:47},3:{halign:"right",cellWidth:24},4:{halign:"right",cellWidth:22},5:{halign:"right",cellWidth:24,fontStyle:"bold"},6:{cellWidth:36},7:{cellWidth:29}}:{0:{cellWidth:40},1:{cellWidth:24},2:{cellWidth:31},3:{halign:"right",cellWidth:18},4:{halign:"right",cellWidth:17},5:{halign:"right",cellWidth:18,fontStyle:"bold"},6:{cellWidth:25},7:{cellWidth:21}},
    didParseCell:data=>{if(data.section!=="body"||data.column.index!==6)return;const v=String(data.cell.raw??"");data.cell.styles.textColor=v==="Sem estoque"||v==="Abaixo do mínimo"?[202,80,65]:v==="No limite mínimo"?[180,124,33]:[42,137,95];}});
  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setDrawColor(235,239,245);doc.line(m,h-12,w-m,h-12);doc.setFontSize(7.2);doc.setTextColor(150,157,169);doc.text("DentalFlow · Relatório de estoque",m,h-7);doc.text(`Página ${p} de ${pages}`,w-m,h-7,{align:"right"});}
  return {doc,name:filename(s.category)};
}

function html(rows:StockItemV2[],categories:StockCategory[],cfg:StockReportConfig){
  const s=summarizeStockReport(rows,categories,cfg),cat=new Map(categories.map(c=>[c.id,c.name])),now=new Date();
  const body=rows.map(i=>{const st=stockReportStatus(i),extra:string[]=[];if(cfg.includeCustomFields&&custom(i))extra.push(custom(i));if(cfg.includeNotes&&i.notes?.trim())extra.push(`Obs.: ${i.notes.trim()}`);
    return `<tr><td><b>${esc(i.name)}</b>${extra.length?`<small>${extra.map(esc).join("<br>")}</small>`:""}</td><td>${esc(cat.get(i.category_id??"")??"—")}</td><td>${esc([i.brand,i.type].filter(Boolean).join(" · ")||"—")}</td><td class="num">${esc(n(i.qty_on_hand))} ${esc(i.unit||"")}</td><td class="num">${esc(n(i.min_qty))} ${esc(i.unit||"")}</td><td class="num rep">${esc(stockReplenishmentNeed(i))} ${esc(i.unit||"")}</td><td class="s-${st.key}">${esc(st.label)}</td><td>${esc(date(i.last_restocked_at))}</td></tr>`;}).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de estoque</title><style>
@page{size:A4 ${cfg.orientation};margin:12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#17253d;font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.head{display:flex;justify-content:space-between;border-bottom:.25mm solid #e6ebf2;padding-bottom:5mm}.brand{font-size:18pt;font-weight:700}.sub,.meta{font-size:7.5pt;color:#7d8797;margin-top:1mm}.right{text-align:right}.title{font-size:13pt;font-weight:700}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:2.4mm;margin:5mm 0}.card{background:#f8fafd;border-radius:2.5mm;padding:3mm}.card b{display:block;font-size:13pt}.card span{font-size:7.2pt;color:#778296}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${cfg.orientation==="landscape"?"7.3pt":"6.8pt"}}th{background:#f5f8fc;color:#48576c;font-size:6.7pt;text-transform:uppercase;text-align:left;padding:2.5mm 1.8mm;border-bottom:.25mm solid #e4eaf2}td{padding:2.4mm 1.8mm;border-bottom:.2mm solid #edf0f5;vertical-align:middle;overflow-wrap:anywhere}tr:nth-child(even){background:#fcfdff}small{display:block;color:#7f8997;font-size:6.4pt;margin-top:.8mm}.num{text-align:right}.rep{font-weight:700}.s-out,.s-below{color:#c95041;font-weight:600}.s-limit{color:#ad7920;font-weight:600}.s-ok{color:#2a895f;font-weight:600}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="head"><div><div class="brand">DENTALFLOW</div><div class="sub">Gestão inteligente de estoque</div></div><div class="right"><div class="title">RELATÓRIO DE ESTOQUE</div><div class="meta">${esc(s.category)}<br>Emitido em ${esc(now.toLocaleDateString("pt-BR"))} às ${esc(now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}))}</div></div></div><div class="cards"><div class="card"><b>${s.total}</b><span>Itens no relatório</span></div><div class="card"><b>${s.attention}</b><span>Atenção</span></div><div class="card"><b>${s.below}</b><span>Abaixo do mínimo</span></div><div class="card"><b>${s.out}</b><span>Zerados</span></div></div><table><thead><tr><th>Material</th><th>Categoria</th><th>Marca / tipo</th><th>Atual</th><th>Mín.</th><th>Repor</th><th>Situação</th><th>Últ. reposição</th></tr></thead><tbody>${body||'<tr><td colspan="8">Nenhum item corresponde aos filtros.</td></tr>'}</tbody></table></body></html>`;
}

function b64(buf:ArrayBuffer){const bytes=new Uint8Array(buf);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out);}

export async function downloadStockReportPdf(items:StockItemV2[],categories:StockCategory[],cfg:StockReportConfig){
  const rows=filterStockReportItems(items,cfg),built=pdf(rows,categories,cfg);
  if(isDentalFlowWindowsDesktop()||isNativeMobileApp()){
    const base64=b64(built.doc.output("arraybuffer"));
    if(isNativeMobileApp()) return {filename:built.name,nativePath:(await savePdfNative(base64,built.name))?.uri??null};
    return {filename:built.name,nativePath:await saveDesktopPdf(built.name,base64)};
  }
  built.doc.save(built.name);return {filename:built.name};
}

export async function printStockReport(items:StockItemV2[],categories:StockCategory[],cfg:StockReportConfig){
  const rows=filterStockReportItems(items,cfg),markup=html(rows,categories,cfg),s=summarizeStockReport(rows,categories,cfg);
  if(isNativeMobileApp()){await printHtmlNative(markup,`DentalFlow - Estoque - ${s.category}`,{paper:"a4",landscape:cfg.orientation==="landscape"});return;}
  const frame=document.createElement("iframe");frame.style.cssText="position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0";document.body.appendChild(frame);
  try{const doc=frame.contentDocument;if(!doc)throw new Error("Não foi possível preparar o relatório.");doc.open();doc.write(markup);doc.close();await new Promise<void>(r=>{if(doc.readyState==="complete")return r();frame.addEventListener("load",()=>r(),{once:true});setTimeout(r,350);});try{await doc.fonts?.ready}catch{}const win=frame.contentWindow;if(!win)throw new Error("Janela de impressão indisponível.");win.focus();win.print();}finally{setTimeout(()=>frame.remove(),60000);}
}
