import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bluetooth, FileText, Plus, Save, Trash2, GripVertical, Usb, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PRINT_TEMPLATE, FIELD_LABEL_BR, type PrintNoteTemplate,
} from "@/lib/print-note/types";
import { fetchMyPrintTemplate, saveMyPrintTemplate } from "@/lib/print-note/api";
import { renderNoteCanvas } from "@/lib/print-note/render-canvas";
import { printNoteBluetooth, sampleCase } from "@/lib/print-note/print";
import { printCaseNoteSystem } from "@/lib/print-note/system-print";
import { bluetoothSupported, pickPrinter } from "@/lib/print-note/bluetooth";
import { supabase } from "@/integrations/supabase/client";
import {
  CASE_NOTE_PAPERS,
  loadCaseNotePrinterSettings,
  loadCaseNotePrinterSettingsForAccount,
  resolveCaseNotePaper,
  saveCaseNotePrinterSettingsForAccount,
  type CaseNotePrinterSettings,
} from "@/lib/print-note/printer-settings";

export function PrintNoteSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["print_template"], queryFn: fetchMyPrintTemplate });
  const [tpl, setTpl] = useState<PrintNoteTemplate>(DEFAULT_PRINT_TEMPLATE);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [printerSettings, setPrinterSettings] = useState<CaseNotePrinterSettings>(() => loadCaseNotePrinterSettings());
  const [printerDirty, setPrinterDirty] = useState(false);
  const printerPaper = resolveCaseNotePaper(printerSettings);

  useEffect(() => {
    if (q.data) {
      setTpl({
        ...q.data,
        header: { ...DEFAULT_PRINT_TEMPLATE.header },
        footer: DEFAULT_PRINT_TEMPLATE.footer,
      });
    }
  }, [q.data]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        setPrinterSettings(loadCaseNotePrinterSettingsForAccount(id) ?? loadCaseNotePrinterSettings());
      }
    });
    return () => { active = false; };
  }, []);

  function patch<K extends keyof PrintNoteTemplate>(k: K, v: PrintNoteTemplate[K]) {
    setTpl(t => ({ ...t, [k]: v })); setDirty(true);
  }

  function patchPrinter(patch: Partial<CaseNotePrinterSettings>) {
    setPrinterSettings((current) => ({ ...current, ...patch }));
    setPrinterDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await saveMyPrintTemplate(tpl);
      if (userId) saveCaseNotePrinterSettingsForAccount(userId, printerSettings);
      await qc.invalidateQueries({ queryKey: ["print_template"] });
      setDirty(false);
      setPrinterDirty(false);
      toast.success("Configuração da nota salva");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  async function testBluetooth() {
    try { await printNoteBluetooth(sampleCase(), tpl); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function testWindow() {
    try { await printCaseNoteSystem(sampleCase(), printerSettings); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function pairPrinter() {
    try { await pickPrinter(); toast.success("Impressora pareada"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        {/* Papel */}
        <Section title="Impressora da Nota do Caso">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-foreground mb-2">Conexão padrão</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => patchPrinter({ transport: "system" })}
                  className={"rounded-xl border p-3 text-left transition " + (printerSettings.transport === "system" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Usb className="h-4 w-4" /> Sistema / USB / rede
                    <Wifi className="h-4 w-4 ml-auto text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">USB, cabo de rede, Wi-Fi ou Bluetooth instalados no sistema.</p>
                </button>
                <button
                  type="button"
                  onClick={() => patchPrinter({ transport: "bluetooth" })}
                  className={"rounded-xl border p-3 text-left transition " + (printerSettings.transport === "bluetooth" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Bluetooth className="h-4 w-4" /> Bluetooth direto
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Conexão Web Bluetooth para térmicas compatíveis.</p>
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-foreground mb-2">Tamanho do papel</div>
              <Select value={printerSettings.paperId} onValueChange={(v) => patchPrinter({ paperId: v })}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_NOTE_PAPERS.map((paper) => (
                    <SelectItem key={paper.id} value={paper.id}>{paper.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(printerSettings.paperId === "custom" || printerSettings.paperId === "continuous") && (
                <div className={`grid gap-3 mt-3 max-w-sm ${printerSettings.paperId === "custom" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <Input
                    type="number"
                    min={40}
                    max={216}
                    value={printerSettings.customWidthMm}
                    onChange={(e) => patchPrinter({ customWidthMm: Number(e.target.value) })}
                    placeholder="Largura (mm)"
                  />
                  {printerSettings.paperId === "custom" && (
                    <Input
                      type="number"
                      min={60}
                      max={500}
                      value={printerSettings.customHeightMm}
                      onChange={(e) => patchPrinter({ customHeightMm: Number(e.target.value) })}
                      placeholder="Altura (mm)"
                    />
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {printerPaper.continuous
                  ? `Largura configurada: ${printerPaper.widthMm} mm · a altura será calculada pelo conteúdo em cada impressão.`
                  : `Área configurada: ${printerPaper.widthMm} × ${printerPaper.heightMm} mm.`}
              </p>
            </div>

            {printerSettings.transport === "bluetooth" && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={pairPrinter} disabled={!bluetoothSupported()} className="gap-2">
                  <Bluetooth className="h-4 w-4" /> Parear impressora
                </Button>
                <Select value={String(printerSettings.dpi)} onValueChange={(v) => patchPrinter({ dpi: Number(v) as 203 | 300 })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="203">203 DPI</SelectItem>
                    <SelectItem value="300">300 DPI</SelectItem>
                  </SelectContent>
                </Select>
                {!bluetoothSupported() && <span className="text-xs text-muted-foreground">Bluetooth Web indisponível neste navegador.</span>}
              </div>
            )}

            <div className="rounded-xl bg-muted/40 border border-border px-3 py-2.5 text-xs text-muted-foreground">
              Depois de salvar, o botão <b>Nota</b> nos detalhes do caso usa esta configuração diretamente. A tela de configuração só reaparece se o vínculo da impressora não estiver disponível naquele dispositivo.
            </div>
          </div>
        </Section>

        {/* Cabeçalho (automático, não editável) */}
        <Section title="Cabeçalho (automático)">
          <p className="text-xs text-muted-foreground">
            O cabeçalho exibe automaticamente o <b>nome do paciente</b>, o <b>número do caso</b> e a <b>data e hora</b> da impressão. Essas informações são preenchidas pelo sistema e não podem ser alteradas.
          </p>
        </Section>

        {/* Campos */}
        <Section title="Informações do caso">
          <div className="space-y-2">
            {tpl.fields.map((f, idx) => (
              <div key={f.key} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/60" />
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground w-28 shrink-0">{FIELD_LABEL_BR[f.key]}</div>
                <Input
                  className="h-8 flex-1"
                  value={f.label}
                  onChange={(e) => {
                    const next = tpl.fields.slice();
                    next[idx] = { ...f, label: e.target.value };
                    patch("fields", next);
                  }}
                />
                <Switch
                  checked={f.show}
                  onCheckedChange={(v) => {
                    const next = tpl.fields.slice();
                    next[idx] = { ...f, show: v };
                    patch("fields", next);
                  }}
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Checklist */}
        <Section title="Checklist">
          <div className="space-y-2">
            {tpl.checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-4 w-4 border-[1.5px] border-foreground/70 rounded-[2px] shrink-0" />
                <Input
                  className="h-8"
                  value={item}
                  onChange={(e) => {
                    const next = tpl.checklist.slice();
                    next[i] = e.target.value;
                    patch("checklist", next);
                  }}
                />
                <Button size="icon" variant="ghost" onClick={() => patch("checklist", tpl.checklist.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => patch("checklist", [...tpl.checklist, ""])}>
              <Plus className="h-4 w-4" /> Novo item
            </Button>
          </div>
        </Section>

        {/* Rodapé (automático) */}
        <Section title="Rodapé (automático)">
          <p className="text-xs text-muted-foreground">
            O rodapé inclui automaticamente a data e a hora da impressão.
          </p>
        </Section>

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-xl border border-border">
          <Button onClick={save} disabled={(!dirty && !printerDirty) || saving} className="gap-2">
            <Save className="h-4 w-4" /> Salvar
          </Button>
          <Button variant="outline" onClick={testBluetooth} disabled={!bluetoothSupported()} className="gap-2">
            <Bluetooth className="h-4 w-4" /> Imprimir teste (Bluetooth)
          </Button>
          <Button variant="outline" onClick={testWindow} className="gap-2">
            <FileText className="h-4 w-4" /> Testar impressora configurada
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-6 self-start">
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70 mb-2">Pré-visualização</div>
        <NotePreview tpl={tpl} />
      </div>
    </div>
  );
}

function NotePreview({ tpl }: { tpl: PrintNoteTemplate }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const c = useMemo(() => sampleCase(), []);

  useEffect(() => {
    const h = hostRef.current; if (!h) return;
    const t = setTimeout(() => {
      const { canvas } = renderNoteCanvas(c, tpl);
      h.innerHTML = "";
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.display = "block";
      h.appendChild(canvas);
    }, 60);
    return () => clearTimeout(t);
  }, [tpl, c]);

  return (
    <div className="rounded-xl border border-border bg-[#f4f5f7] p-4">
      <div className="mx-auto bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,.25)] rounded-md overflow-hidden" style={{ maxWidth: 320 }}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Label({ children, hint, className = "" }: { children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between mb-1 ${className}`}>
      <div className="text-xs font-medium text-foreground">{children}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
