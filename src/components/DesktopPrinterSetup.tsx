import { useEffect, useState } from "react";
import { Printer, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDesktopPrinters, openDesktopPrinterSettings, type DesktopPrinter } from "@/lib/desktop-local";

export function DesktopPrinterSetup({
  value,
  onChange,
  disabled = false,
}: {
  value?: string | null;
  onChange: (printerName: string) => void;
  disabled?: boolean;
}) {
  const [printers, setPrinters] = useState<DesktopPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listDesktopPrinters();
      setPrinters(rows);
      if ((!value || !rows.some((row) => row.name === value)) && rows.length) {
        onChange(rows.find((row) => row.is_default)?.name ?? rows[0].name);
      }
    } catch (e) {
      setError((e as Error)?.message || "Não foi possível listar as impressoras do Windows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Printer className="h-4 w-4" /> Impressora do Windows</div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || loading} onClick={() => void refresh()} title="Atualizar impressoras"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} onClick={() => void openDesktopPrinterSettings()} title="Configurações de impressoras do Windows"><Settings2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || loading || printers.length === 0}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {printers.length === 0 && <option value="">{loading ? "Procurando impressoras…" : "Nenhuma impressora encontrada"}</option>}
        {printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.name}{printer.is_default ? " · padrão" : ""}</option>)}
      </select>
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">No aplicativo Windows, a Nota pode ser enviada diretamente à impressora selecionada, sem abrir a janela de impressão do navegador. A ponte nativa desta versão usa conteúdo textual.</p>}
    </div>
  );
}
