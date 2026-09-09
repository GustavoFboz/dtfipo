import { useEffect, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CaseNotePrinterSettings } from "@/lib/print-note/printer-settings";
import {
  desktopDirectPrintingAvailable,
  listDesktopPrinters,
  openDesktopPrinterSettings,
  type DesktopPrinterInfo,
} from "@/lib/print-note/desktop-print";
import { toast } from "sonner";

export function DesktopPrinterSetup({
  settings,
  onChange,
}: {
  settings: CaseNotePrinterSettings;
  onChange: (next: CaseNotePrinterSettings) => void;
}) {
  const desktop = desktopDirectPrintingAvailable();
  const [printers, setPrinters] = useState<DesktopPrinterInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!desktop || loading) return;
    setLoading(true);
    try {
      const rows = await listDesktopPrinters();
      setPrinters(rows);
      if (!settings.printerName) {
        const preferred = rows.find((p) => p.is_default) ?? rows[0];
        if (preferred) onChange({ ...settings, printerName: preferred.name, printerModel: preferred.name });
      }
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível listar as impressoras do Windows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [desktop]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!desktop) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Impressora do Windows</div>
          <div className="text-[11px] text-muted-foreground">Depois de salvar, a Nota é enviada diretamente sem abrir o diálogo do navegador.</div>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} disabled={loading} title="Atualizar impressoras">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openDesktopPrinterSettings().catch((e) => toast.error((e as Error).message))} title="Configurações de impressoras do Windows">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <select
        value={settings.printerName ?? ""}
        onChange={(e) => onChange({ ...settings, printerName: e.target.value || null, printerModel: e.target.value || null })}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Impressora padrão do Windows</option>
        {printers.map((printer) => (
          <option key={printer.name} value={printer.name}>{printer.name}{printer.is_default ? " · padrão" : ""}</option>
        ))}
      </select>
    </div>
  );
}
