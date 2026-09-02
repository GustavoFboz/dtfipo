import { useRef, useState } from "react";
import { Bluetooth, Printer, Usb, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/types";
import { fetchMyPrintTemplate } from "@/lib/print-note/api";
import { printNoteBluetooth } from "@/lib/print-note/print";
import { bluetoothSupported } from "@/lib/print-note/bluetooth";
import { printCaseNoteSystem } from "@/lib/print-note/system-print";
import {
  CASE_NOTE_PAPERS,
  loadCaseNotePrinterSettings,
  loadCaseNotePrinterSettingsForAccount,
  resolveCaseNotePaper,
  saveCaseNotePrinterSettingsForAccount,
  type CaseNotePrinterSettings,
} from "@/lib/print-note/printer-settings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Variant = "pill" | "icon";

const globalPrintLock = new Set<string>();

export function PrintNoteButton({ caseRow, variant = "pill" }: { caseRow: CaseRow; variant?: Variant }) {
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupReason, setSetupReason] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CaseNotePrinterSettings>(() => loadCaseNotePrinterSettings());
  const lockRef = useRef(false);

  const paper = resolveCaseNotePaper(settings);
  const bluetoothReady = bluetoothSupported();

  async function currentUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  function requestSetup(userId: string, reason?: string) {
    setActiveUserId(userId);
    setSettings(loadCaseNotePrinterSettings());
    setSetupReason(reason ?? null);
    setSetupOpen(true);
  }

  async function executePrint(userId: string, selected: CaseNotePrinterSettings) {
    if (lockRef.current || busy || globalPrintLock.has(caseRow.id)) return;
    lockRef.current = true;
    globalPrintLock.add(caseRow.id);
    setBusy(true);

    try {
      if (selected.transport === "bluetooth") {
        if (!bluetoothSupported()) {
          throw new Error("A impressora Bluetooth configurada não está disponível neste dispositivo.");
        }
        const tpl = await fetchMyPrintTemplate();
        if (!tpl) {
          throw new Error("A configuração Bluetooth desta conta está incompleta.");
        }
        await printNoteBluetooth(caseRow, tpl);
      } else {
        await printCaseNoteSystem(caseRow, selected);
      }
    } catch (err) {
      const message = (err as Error)?.message || "Não foi possível acessar a impressora configurada.";
      if (selected.transport === "bluetooth" || isPrinterAvailabilityError(err)) {
        requestSetup(userId, message);
      } else {
        toast.error(message);
      }
      throw err;
    } finally {
      setBusy(false);
      lockRef.current = false;
      globalPrintLock.delete(caseRow.id);
    }
  }

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (busy || lockRef.current || globalPrintLock.has(caseRow.id)) return;

    const userId = await currentUserId();
    if (!userId) {
      toast.error("Sua sessão expirou. Entre novamente para imprimir a nota.");
      return;
    }

    const saved = loadCaseNotePrinterSettingsForAccount(userId);
    if (!saved) {
      requestSetup(userId, "Configure a impressora da Nota do Caso uma única vez neste dispositivo.");
      return;
    }

    try {
      await executePrint(userId, saved);
    } catch {
      // A falha de disponibilidade já encaminha o usuário para a configuração.
    }
  }

  async function saveAndPrintFromSetup() {
    const userId = activeUserId ?? await currentUserId();
    if (!userId) {
      toast.error("Sua sessão expirou. Entre novamente para configurar a impressora.");
      return;
    }

    saveCaseNotePrinterSettingsForAccount(userId, settings);
    setSetupReason(null);

    try {
      await executePrint(userId, settings);
      setSetupOpen(false);
    } catch {
      // Mantém a configuração aberta caso o novo vínculo ainda não funcione.
    }
  }

  return (
    <>
      {variant === "icon" ? (
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
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={handleClick}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background text-primary hover:bg-primary/10 transition text-xs font-medium disabled:opacity-60"
          title="Imprimir nota do caso"
          aria-label="Imprimir nota do caso"
        >
          <Printer className="h-3.5 w-3.5" />
          {busy ? "Imprimindo…" : "Nota"}
        </button>
      )}

      <Dialog open={setupOpen} onOpenChange={(next) => !busy && setSetupOpen(next)}>
        <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Configurar impressora neste dispositivo</DialogTitle>
            <DialogDescription>
              {setupReason || "Depois desta configuração, o botão Nota imprimirá diretamente usando estas preferências."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              Esta etapa só aparece na primeira utilização da conta neste dispositivo ou quando a impressora configurada deixa de estar disponível.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Conexão da impressora</div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, transport: "system" }))}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (settings.transport === "system" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60")
                  }
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Usb className="h-4 w-4" /> Sistema / USB / rede <Wifi className="h-4 w-4 ml-auto text-muted-foreground" />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Para impressoras instaladas no Windows/macOS por USB, cabo de rede, Wi‑Fi ou Bluetooth.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, transport: "bluetooth" }))}
                  className={
                    "w-full rounded-xl border p-3 text-left transition " +
                    (settings.transport === "bluetooth" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60")
                  }
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Bluetooth className="h-4 w-4" /> Bluetooth direto
                    <span className="ml-auto text-xs text-muted-foreground">{bluetoothReady ? "Disponível" : "Indisponível"}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Impressão direta para térmicas compatíveis com Web Bluetooth.
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={"case-note-paper-" + caseRow.id} className="text-sm font-medium text-foreground">
                Tamanho do papel
              </label>
              <select
                id={"case-note-paper-" + caseRow.id}
                value={settings.paperId}
                onChange={(e) => setSettings((s) => ({ ...s, paperId: e.target.value }))}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {CASE_NOTE_PAPERS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} · {preset.description}
                  </option>
                ))}
              </select>

              {settings.paperId === "custom" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Largura (mm)</span>
                    <input
                      type="number"
                      min={40}
                      max={216}
                      step={0.1}
                      value={settings.customWidthMm}
                      onChange={(e) => setSettings((s) => ({ ...s, customWidthMm: Number(e.target.value) }))}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Altura (mm)</span>
                    <input
                      type="number"
                      min={60}
                      max={500}
                      step={0.1}
                      value={settings.customHeightMm}
                      onChange={(e) => setSettings((s) => ({ ...s, customHeightMm: Number(e.target.value) }))}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Área da nota: {paper.widthMm} × {paper.heightMm} mm.
              </div>
            </div>

            {settings.transport === "bluetooth" && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Resolução térmica</div>
                <div className="flex gap-2">
                  {[203, 300].map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, dpi: dpi as 203 | 300 }))}
                      className={
                        "rounded-lg border px-3 py-2 text-xs font-medium transition " +
                        (settings.dpi === dpi
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/60")
                      }
                    >
                      {dpi} DPI
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" disabled={busy} onClick={() => setSetupOpen(false)}>
              Agora não
            </Button>
            <Button
              type="button"
              disabled={busy || (settings.transport === "bluetooth" && !bluetoothReady)}
              onClick={saveAndPrintFromSetup}
            >
              <Printer className="h-4 w-4 mr-2" />
              {busy ? "Preparando…" : "Salvar e imprimir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isPrinterAvailabilityError(error: unknown) {
  const err = error as { name?: string; message?: string } | null;
  const textValue = ((err?.name || "") + " " + (err?.message || "")).toLocaleLowerCase("pt-BR");
  return [
    "notfounderror",
    "notreadableerror",
    "networkerror",
    "securityerror",
    "bluetooth",
    "gatt",
    "device",
    "dispositivo",
    "impressora",
    "printer",
    "usb",
  ].some((token) => textValue.includes(token));
}
