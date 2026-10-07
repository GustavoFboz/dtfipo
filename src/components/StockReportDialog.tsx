import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Download, FileText, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StockCategory, StockItemV2 } from "@/lib/stock-v2";
import {
  DEFAULT_STOCK_REPORT_CONFIG,
  downloadStockReportPdf,
  filterStockReportItems,
  printStockReport,
  summarizeStockReport,
  type StockReportConfig,
} from "@/lib/stock-report";

const STORAGE_KEY="dentalflow:stock-report-config:v1";

function readSaved():Partial<StockReportConfig>{
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}") as Partial<StockReportConfig>;}catch{return {};}
}

export function StockReportDialog({
  items,categories,initialCategoryId,initialQuery,onClose,
}:{
  items:StockItemV2[];
  categories:StockCategory[];
  initialCategoryId?:string|null;
  initialQuery?:string;
  onClose:()=>void;
}){
  const [cfg,setCfg]=useState<StockReportConfig>(()=>({
    ...DEFAULT_STOCK_REPORT_CONFIG,
    ...readSaved(),
    categoryId:initialCategoryId||readSaved().categoryId||"all",
    query:initialQuery??readSaved().query??"",
  }));
  const [busy,setBusy]=useState<"print"|"download"|null>(null);

  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(cfg));}catch{}},[cfg]);

  const rows=useMemo(()=>filterStockReportItems(items,cfg),[items,cfg]);
  const summary=useMemo(()=>summarizeStockReport(rows,categories,cfg),[rows,categories,cfg]);

  const brands=useMemo(()=>Array.from(new Set(items.filter(i=>cfg.categoryId==="all"||i.category_id===cfg.categoryId).map(i=>i.brand?.trim()).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,"pt-BR")),[items,cfg.categoryId]);
  const types=useMemo(()=>Array.from(new Set(items.filter(i=>cfg.categoryId==="all"||i.category_id===cfg.categoryId).map(i=>i.type?.trim()).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,"pt-BR")),[items,cfg.categoryId]);

  const patch=(next:Partial<StockReportConfig>)=>setCfg(current=>({...current,...next}));
  const reset=()=>setCfg({...DEFAULT_STOCK_REPORT_CONFIG,categoryId:initialCategoryId||"all",query:initialQuery||""});

  async function print(){
    if(!rows.length)return toast.error("Nenhum item corresponde aos filtros selecionados.");
    setBusy("print");
    try{await printStockReport(items,categories,cfg);}
    catch(e){toast.error((e as Error).message||"Não foi possível imprimir o relatório.");}
    finally{setBusy(null);}
  }

  async function download(){
    if(!rows.length)return toast.error("Nenhum item corresponde aos filtros selecionados.");
    setBusy("download");
    try{
      const result=await downloadStockReportPdf(items,categories,cfg);
      toast.success(result.nativePath?"PDF salvo no dispositivo.":"Download do PDF iniciado.");
    }catch(e){toast.error((e as Error).message||"Não foi possível gerar o PDF.");}
    finally{setBusy(null);}
  }

  return <Dialog open onOpenChange={open=>!open&&onClose()}>
    <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl font-medium"><FileText className="h-5 w-5 text-primary"/>Relatório avançado de estoque</DialogTitle>
        <p className="text-sm font-light text-muted-foreground">Configure o A4 uma vez; o DentalFlow memoriza suas preferências neste dispositivo.</p>
      </DialogHeader>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoria / material">
              <select value={cfg.categoryId} onChange={e=>patch({categoryId:e.target.value,brand:"",type:""})} className="control">
                <option value="all">Todo o estoque</option>
                {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Situação do estoque">
              <select value={cfg.status} onChange={e=>patch({status:e.target.value as StockReportConfig["status"]})} className="control">
                <option value="all">Todos</option>
                <option value="attention">Atenção (mínimo ou abaixo)</option>
                <option value="below_min">Abaixo do mínimo</option>
                <option value="out">Sem estoque</option>
              </select>
            </Field>
            <Field label="Marca">
              <select value={cfg.brand} onChange={e=>patch({brand:e.target.value})} className="control">
                <option value="">Todas as marcas</option>{brands.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select value={cfg.type} onChange={e=>patch({type:e.target.value})} className="control">
                <option value="">Todos os tipos</option>{types.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Busca dentro do relatório">
            <input value={cfg.query} onChange={e=>patch({query:e.target.value})} placeholder="Nome, marca, tipo, observação ou campo personalizado…" className="control"/>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ordenar por">
              <select value={cfg.sortBy} onChange={e=>patch({sortBy:e.target.value as StockReportConfig["sortBy"]})} className="control">
                <option value="name">Nome</option><option value="brand">Marca</option><option value="qty">Quantidade</option><option value="replenishment">Necessidade de reposição</option>
              </select>
            </Field>
            <Field label="Ordem">
              <select value={cfg.sortDir} onChange={e=>patch({sortDir:e.target.value as "asc"|"desc"})} className="control">
                <option value="asc">Crescente</option><option value="desc">Decrescente</option>
              </select>
            </Field>
            <Field label="A4">
              <select value={cfg.orientation} onChange={e=>patch({orientation:e.target.value as "portrait"|"landscape"})} className="control">
                <option value="portrait">Retrato</option><option value="landscape">Paisagem</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Check label="Incluir campos personalizados" checked={cfg.includeCustomFields} onChange={v=>patch({includeCustomFields:v})}/>
            <Check label="Incluir observações dos itens" checked={cfg.includeNotes} onChange={v=>patch({includeNotes:v})}/>
          </div>

          <button onClick={reset} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="h-3.5 w-3.5"/>Restaurar padrão</button>
        </section>

        <aside className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[.14em] text-muted-foreground">Prévia inteligente</p>
            <h3 className="mt-1 text-lg font-medium">{summary.category}</h3>
            <p className="text-xs text-muted-foreground">{rows.length} item(ns) serão incluídos.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric value={summary.total} label="Itens"/>
            <Metric value={summary.attention} label="Atenção"/>
            <Metric value={summary.below} label="Abaixo do mínimo"/>
            <Metric value={summary.out} label="Zerados"/>
          </div>

          <div className="rounded-xl bg-background border border-border p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0"/>
              <p className="text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Reposição sugerida</strong> é calculada item a item como a diferença entre o estoque mínimo e a quantidade atual. Itens exatamente no mínimo aparecem como “No limite mínimo”.</p>
            </div>
          </div>

          <div className="text-[11px] leading-relaxed text-muted-foreground">A impressão usa o mesmo layout A4 na Web, Windows e Android. No Android abre o sistema nativo de impressão; no Windows/Web abre o diálogo de impressão do sistema/navegador. O botão Baixar salva o PDF localmente.</div>
        </aside>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!!busy||!rows.length} onClick={()=>void download()} className="rounded-full px-5"><Download className="mr-2 h-4 w-4"/>{busy==="download"?"Gerando…":"Baixar PDF"}</Button>
          <Button disabled={!!busy||!rows.length} onClick={()=>void print()} className="rounded-full px-5"><Printer className="mr-2 h-4 w-4"/>{busy==="print"?"Preparando…":"Imprimir A4"}</Button>
        </div>
      </DialogFooter>
      <style>{`.control{height:2.5rem;width:100%;border-radius:.75rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:0 .75rem;font-size:.875rem;outline:none}.control:focus{box-shadow:0 0 0 2px hsl(var(--ring)/.25)}`}</style>
    </DialogContent>
  </Dialog>;
}

function Field({label,children}:{label:string;children:ReactNode}){return <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;}
function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="h-4 w-4 accent-primary"/><span>{label}</span></label>;}
function Metric({value,label}:{value:number;label:string}){return <div className="rounded-xl bg-background border border-border px-3 py-3"><div className="text-xl font-light tabular-nums">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>;}
