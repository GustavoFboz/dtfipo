import { useRef, useState } from "react";
import { Bluetooth, Printer, Usb, Wifi } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/types";
import { fetchMyPrintTemplate } from "@/lib/print-note/api";
import { printNoteBluetooth } from "@/lib/print-note/print";
import { bluetoothSupported } from "@/lib/print-note/bluetooth";
import { printCaseNoteSystem } from "@/lib/print-note/system-print";
import { CASE_NOTE_PAPERS, loadCaseNotePrinterSettings, resolveCaseNotePaper, saveCaseNotePrinterSettings, type CaseNotePrinterSettings } from "@/lib/print-note/printer-settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Variant = "pill" | "icon";
const globalPrintLock = new Set<string>();

export function PrintNoteButton({ caseRow, variant = "pill" }: { caseRow: CaseRow; variant?: Variant }) {
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);
  const [settings,setSettings]=useState<CaseNotePrinterSettings>(()=>loadCaseNotePrinterSettings());
  const lockRef=useRef(false);
  const tplQ=useQuery({queryKey:["print_template"],queryFn:fetchMyPrintTemplate,staleTime:30_000,enabled:open||settings.transport==="bluetooth"});
  const paper=resolveCaseNotePaper(settings);
  const bluetoothReady=bluetoothSupported();

  function openPrinterDialog(e:React.MouseEvent){
    e.stopPropagation();e.preventDefault();
    if(busy)return;
    setSettings(loadCaseNotePrinterSettings());
    setOpen(true);
  }
  async function handlePrint(){
    if(lockRef.current||busy||globalPrintLock.has(caseRow.id))return;
    lockRef.current=true;globalPrintLock.add(caseRow.id);setBusy(true);saveCaseNotePrinterSettings(settings);
    try{
      if(settings.transport==="bluetooth"){
        if(!bluetoothReady)throw new Error("Bluetooth direto não está disponível neste navegador. Use a impressão pelo sistema ou um navegador compatível.");
        const tpl=tplQ.data;
        if(!tpl)throw new Error("Configuração Bluetooth não encontrada. Configure o modelo de impressão antes de usar o Bluetooth direto.");
        await printNoteBluetooth(caseRow,tpl);
      }else{
        await printCaseNoteSystem(caseRow,settings);
      }
      setOpen(false);
    }catch(err){toast.error((err as Error).message||"Falha na impressão da nota");}
    finally{setBusy(false);lockRef.current=false;globalPrintLock.delete(caseRow.id);}
  }

  return <>{variant==="icon"?(
    <button type="button" disabled={busy} onClick={openPrinterDialog} className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-60" title="Imprimir nota do caso" aria-label="Imprimir nota do caso"><Printer className="h-4 w-4"/></button>
  ):(
    <button type="button" disabled={busy} onClick={openPrinterDialog} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background text-primary hover:bg-primary/10 transition text-xs font-medium disabled:opacity-60" title="Imprimir nota do caso" aria-label="Imprimir nota do caso"><Printer className="h-3.5 w-3.5"/>Nota</button>
  )}
  <Dialog open={open} onOpenChange={next=>!busy&&setOpen(next)}>
    <DialogContent className="sm:max-w-lg" onClick={e=>e.stopPropagation()}>
      <DialogHeader><DialogTitle>Imprimir nota do caso</DialogTitle><DialogDescription>O Guia Rápido será redimensionado automaticamente para o papel selecionado.</DialogDescription></DialogHeader>
      <div className="space-y-5 py-1">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Conexão da impressora</div>
          <div className="grid gap-2">
            <button type="button" onClick={()=>setSettings(s=>({...s,transport:"system"}))} className={`w-full rounded-xl border p-3 text-left transition ${settings.transport==="system"?"border-primary bg-primary/5":"border-border hover:bg-muted/60"}`}>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Usb className="h-4 w-4"/>Sistema / USB / rede<Wifi className="h-4 w-4 ml-auto text-muted-foreground"/></div>
              <div className="mt-1 text-xs text-muted-foreground">Recomendado. Funciona com impressoras USB, cabeadas, Ethernet, Wi‑Fi e Bluetooth instaladas no Windows/macOS.</div>
            </button>
            <button type="button" onClick={()=>setSettings(s=>({...s,transport:"bluetooth"}))} className={`w-full rounded-xl border p-3 text-left transition ${settings.transport==="bluetooth"?"border-primary bg-primary/5":"border-border hover:bg-muted/60"}`}>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Bluetooth className="h-4 w-4"/>Bluetooth direto<span className="ml-auto text-xs text-muted-foreground">{bluetoothReady?"Disponível":"Indisponível"}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">Mantém o fluxo Web Bluetooth já existente para térmicas compatíveis.</div>
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={`case-note-paper-${caseRow.id}`} className="text-sm font-medium text-foreground">Tamanho do papel</label>
          <select id={`case-note-paper-${caseRow.id}`} value={settings.paperId} onChange={e=>setSettings(s=>({...s,paperId:e.target.value}))} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
            {CASE_NOTE_PAPERS.map(preset=><option key={preset.id} value={preset.id}>{preset.label} · {preset.description}</option>)}
          </select>
          {settings.paperId==="custom"&&<div className="grid grid-cols-2 gap-3 pt-1">
            <label className="space-y-1 text-xs text-muted-foreground"><span>Largura (mm)</span><input type="number" min={40} max={216} step={0.1} value={settings.customWidthMm} onChange={e=>setSettings(s=>({...s,customWidthMm:Number(e.target.value)}))} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"/></label>
            <label className="space-y-1 text-xs text-muted-foreground"><span>Altura (mm)</span><input type="number" min={60} max={500} step={0.1} value={settings.customHeightMm} onChange={e=>setSettings(s=>({...s,customHeightMm:Number(e.target.value)}))} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"/></label>
          </div>}
          <div className="text-xs text-muted-foreground">Área da nota: {paper.widthMm} × {paper.heightMm} mm. Para a Tomate MDK‑2054N, selecione o tamanho físico da etiqueta/rolo configurado no driver.</div>
        </div>
        {settings.transport==="bluetooth"&&<div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Resolução térmica</div>
          <div className="flex gap-2">{[203,300].map(dpi=><button key={dpi} type="button" onClick={()=>setSettings(s=>({...s,dpi:dpi as 203|300}))} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${settings.dpi===dpi?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:bg-muted/60"}`}>{dpi} DPI</button>)}</div>
        </div>}
      </div>
      <DialogFooter><Button variant="ghost" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</Button><Button type="button" disabled={busy||(settings.transport==="bluetooth"&&!bluetoothReady)} onClick={handlePrint}><Printer className="h-4 w-4 mr-2"/>{busy?"Preparando…":"Imprimir nota"}</Button></DialogFooter>
    </DialogContent>
  </Dialog></>;
}
