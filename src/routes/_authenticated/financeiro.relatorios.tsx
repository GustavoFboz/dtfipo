// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Printer, FileSpreadsheet, FileText, Share2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/relatorios")({
  component: RelatoriosPage,
});

type Row = {
  case_id: string;
  case_number: number | null;
  patient: string;
  procedure: string;
  date: string;
  teeth_count: number;
  unit_price: number;
  subtotal: number;
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function iso(d: Date) { return d.toISOString().slice(0, 10); }

function RelatoriosPage() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(iso(firstDay));
  const [to, setTo] = useState(iso(today));
  const [status, setStatus] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [clinicName, setClinicName] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  async function load() {
    let q = supabase
      .from("cases")
      .select("id, case_number, entry_date, delivery_date, status, teeth_numbers, gross_amount, patient_id, case_type_id")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: false });
    if (status !== "all") q = q.eq("status", status);
    const { data: cs, error } = await q;
    if (error) { toast.error(error.message); return; }
    const patientIds = Array.from(new Set((cs ?? []).map((c) => c.patient_id).filter(Boolean)));
    const typeIds = Array.from(new Set((cs ?? []).map((c) => c.case_type_id).filter(Boolean) as string[]));
    const [{ data: pats }, { data: types }] = await Promise.all([
      patientIds.length ? supabase.from("patients").select("id, name").in("id", patientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      typeIds.length ? supabase.from("case_types").select("id, name").in("id", typeIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const pMap = Object.fromEntries((pats ?? []).map((p) => [p.id, p.name]));
    const tMap = Object.fromEntries((types ?? []).map((t) => [t.id, t.name]));
    const mapped: Row[] = (cs ?? []).map((c) => {
      const teeth = Array.isArray(c.teeth_numbers) ? c.teeth_numbers.length : 0;
      const subtotal = Number(c.gross_amount ?? 0);
      const unit = teeth > 0 ? subtotal / teeth : subtotal;
      return {
        case_id: c.id,
        case_number: c.case_number,
        patient: pMap[c.patient_id as string] ?? "—",
        procedure: (c.case_type_id && tMap[c.case_type_id]) || "—",
        date: c.entry_date as string,
        teeth_count: teeth,
        unit_price: unit,
        subtotal,
      };
    });
    setRows(mapped);
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: prof } = await supabase.from("profiles").select("clinic_id").eq("id", u.user.id).maybeSingle();
        if (prof?.clinic_id) {
          const { data: c } = await supabase.from("clinics").select("name").eq("id", prof.clinic_id).maybeSingle();
          setClinicName(c?.name ?? "");
        }
      }
    })();
    load();
  }, []);

  const total = useMemo(() => rows.reduce((s, r) => s + r.subtotal, 0), [rows]);
  const totalTeeth = useMemo(() => rows.reduce((s, r) => s + r.teeth_count, 0), [rows]);

  function handlePrint() {
    window.print();
  }

  function handleExcel() {
    const header = ["Data", "Caso", "Paciente", "Procedimento", "Dentes", "Valor unitário", "Subtotal"];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push([
        new Date(r.date).toLocaleDateString("pt-BR"),
        `#${r.case_number ?? ""}`,
        r.patient.replace(/;/g, ","),
        r.procedure.replace(/;/g, ","),
        String(r.teeth_count),
        r.unit_price.toFixed(2).replace(".", ","),
        r.subtotal.toFixed(2).replace(".", ","),
      ].join(";"));
    });
    lines.push(["", "", "", "TOTAL", String(totalTeeth), "", total.toFixed(2).replace(".", ",")].join(";"));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `producao_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handlePdf() {
    // Print-to-PDF via browser dialog (native, no dependency)
    handlePrint();
  }

  async function handleShare() {
    const text = `Relatório de Produção · ${from} a ${to}\nCasos: ${rows.length} · Dentes: ${totalTeeth} · Total: ${brl(total)}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Relatório de Produção", text }); return; } catch { /* ignore */ }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Resumo copiado");
  }

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; inset: 0; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">Relatórios</div>
          <h1 className="text-3xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">Produção profissional</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExcel}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel</Button>
          <Button variant="outline" onClick={handlePdf}><FileText className="h-4 w-4 mr-2" />PDF</Button>
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Imprimir</Button>
          <Button onClick={handleShare}><Share2 className="h-4 w-4 mr-2" />Compartilhar</Button>
        </div>
      </div>

      <div className="no-print grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="finished">Finalizados</SelectItem>
              <SelectItem value="delivered">Entregues</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end"><Button className="w-full" onClick={load}>Atualizar</Button></div>
      </div>

      {/* Printable area */}
      <div id="print-area" ref={printRef} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">Relatório de Produção</div>
            <div className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-tight">{clinicName || "Laboratório"}</div>
            <div className="text-xs text-slate-500 mt-1">Período: {new Date(from).toLocaleDateString("pt-BR")} — {new Date(to).toLocaleDateString("pt-BR")}</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            Emitido em<br />
            <span className="text-slate-800 dark:text-slate-200">{new Date().toLocaleString("pt-BR")}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[10px] tracking-[0.08em]">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Caso</th>
                <th className="text-left px-4 py-3">Paciente</th>
                <th className="text-left px-4 py-3">Procedimento</th>
                <th className="text-right px-4 py-3">Dentes</th>
                <th className="text-right px-4 py-3">Valor un.</th>
                <th className="text-right px-4 py-3">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Nenhum caso no período.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.case_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 tabular-nums">{new Date(r.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 tabular-nums">#{r.case_number ?? "—"}</td>
                  <td className="px-4 py-3">{r.patient}</td>
                  <td className="px-4 py-3">{r.procedure}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.teeth_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(r.unit_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{brl(r.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-[0.08em] text-slate-500">Total</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{totalTeeth}</td>
                <td></td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-base">{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex justify-between">
          <span>{rows.length} caso(s) no período</span>
          <span>Gerado pelo módulo Financeiro</span>
        </div>
      </div>
    </div>
  );
}
