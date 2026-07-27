import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/types";
import { fetchMyPrintTemplate } from "@/lib/print-note/api";
import { printNoteBluetooth, printNoteWindow } from "@/lib/print-note/print";
import { bluetoothSupported } from "@/lib/print-note/bluetooth";

type Variant = "pill" | "icon";

// Trava global entre instâncias — evita que múltiplos botões (grid + dialog)
// disparem impressões concorrentes para o mesmo caso.
const globalPrintLock = new Set<string>();

export function PrintNoteButton({ caseRow, variant = "pill" }: { caseRow: CaseRow; variant?: Variant }) {
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false); // guard síncrono anti clique-múltiplo
  const tplQ = useQuery({ queryKey: ["print_template"], queryFn: fetchMyPrintTemplate, staleTime: 30_000 });

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const tpl = tplQ.data;
    if (!tpl) return;
    if (lockRef.current || busy) return;
    if (globalPrintLock.has(caseRow.id)) return;
    lockRef.current = true;
    globalPrintLock.add(caseRow.id);
    setBusy(true);
    try {
      const useBluetooth = tpl.paper !== "a4" && bluetoothSupported();
      if (useBluetooth) await printNoteBluetooth(caseRow, tpl);
      else await printNoteWindow(caseRow, tpl);
    } catch (err) {
      toast.error((err as Error).message || "Falha na impressão");
    } finally {
      setBusy(false);
      lockRef.current = false;
      globalPrintLock.delete(caseRow.id);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-60"
        title="Imprimir nota do caso"
        aria-label="Imprimir nota do caso"
      >
        <Printer className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleClick}
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#1F8AFF]/30 bg-white text-[#1F8AFF] hover:bg-[#1F8AFF]/10 transition text-xs font-medium disabled:opacity-60"
      title="Imprimir nota do caso"
    >
      <Printer className="h-3.5 w-3.5" />
      Nota
    </button>
  );
}
