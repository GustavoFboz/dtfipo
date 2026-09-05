import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchPatients } from "@/lib/api";
import { fetchClinicContext, fetchClinicFinancialEntries, saveClinicFinancialEntry } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/financeiro")({ component: ClinicFinancePage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

function ClinicFinancePage() { return <ClinicPageGuard permission="clinical.financial"><Finance /></ClinicPageGuard>; }

function Finance() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const entries = useQuery({ queryKey: ["clinic_financial", month], queryFn: () => fetchClinicFinancialEntries(month) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const values = useMemo(() => {
    const list = entries.data ?? [];
    const active = list.filter((x: any) => x.status !== "cancelled");
    const revenue = active.filter((x: any) => x.kind === "revenue").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    const expense = active.filter((x: any) => x.kind === "expense").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    const pending = active.filter((x: any) => x.status === "pending").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    return { revenue, expense, pending };
  }, [entries.data]);

  return <div className="mx-auto max-w-[1450px] px-6 py-10 md:px-12">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Clínica</div><h1 className="mt-2 text-4xl font-extralight tracking-tight text-slate-950 dark:text-white">Financeiro clínico</h1><p className="mt-2 text-sm font-light text-slate-500">Receitas e despesas do consultório, sem misturar com o financeiro do laboratório.</p></div><Button onClick={() => setOpen(true)} className="h-11 rounded-full px-5"><Plus className="mr-2 h-4 w-4" /> Novo lançamento</Button></div>

    <div className="mt-8 flex items-center gap-3"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[190px]" /></div>
    <div className="mt-5 grid gap-4 md:grid-cols-3"><Metric label="Receitas" value={brl(values.revenue)} /><Metric label="Despesas" value={brl(values.expense)} /><Metric label="Pendentes" value={brl(values.pending)} /></div>

    <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
      {(entries.data ?? []).map((e: any) => <div key={e.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-white/5 md:grid-cols-[110px_1fr_160px_130px] md:items-center"><div className="text-xs font-light text-slate-400">{e.due_date ? new Date(`${e.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</div><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.description}</div><div className="mt-0.5 text-xs font-light text-slate-400">{e.category || (e.kind === "revenue" ? "Receita" : "Despesa")}{e.patient?.name ? ` · ${e.patient.name}` : ""}</div></div><div className={`text-sm font-medium ${e.kind === "revenue" ? "text-emerald-600" : "text-rose-500"}`}>{e.kind === "expense" ? "−" : "+"}{brl(Number(e.amount_cents || 0))}</div><div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-white/5">{e.status}</span></div></div>)}
      {!entries.isLoading && (entries.data ?? []).length === 0 && <div className="py-16 text-center text-sm font-light text-slate-400">Nenhum lançamento neste mês.</div>}
    </div>
    <FinancialDialog open={open} onOpenChange={setOpen} clinicId={context.data?.clinicId ?? null} patients={patients.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["clinic_financial"] })} />
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-xs font-light text-slate-400"><WalletCards className="h-4 w-4 text-primary" /> {label}</div><div className="mt-4 text-2xl font-light text-slate-900 dark:text-white">{value}</div></div>; }

function FinancialDialog({ open, onOpenChange, clinicId, patients, onSaved }: any) {
  const [kind, setKind] = useState<"revenue" | "expense">("revenue"); const [description, setDescription] = useState(""); const [category, setCategory] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10)); const [status, setStatus] = useState<"pending" | "paid" | "cancelled">("pending"); const [patientId, setPatientId] = useState("none");
  const save = useMutation({ mutationFn: () => { if (!clinicId || !description.trim()) throw new Error("Preencha a descrição."); const cents = Math.round(Number(amount.replace(",", ".")) * 100); if (!Number.isFinite(cents) || cents < 0) throw new Error("Valor inválido."); return saveClinicFinancialEntry({ clinic_id: clinicId, kind, description: description.trim(), category: category.trim() || null, amount_cents: cents, due_date: dueDate || null, status, patient_id: patientId === "none" ? null : patientId }); }, onSuccess: () => { toast.success("Lançamento salvo"); onSaved(); onOpenChange(false); setDescription(""); setAmount(""); }, onError: (e: Error) => toast.error(e.message) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-[26px] sm:max-w-lg"><DialogHeader><DialogTitle className="text-2xl font-light">Novo lançamento</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-1.5"><Label>Tipo</Label><Select value={kind} onValueChange={(v) => setKind(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="revenue">Receita</SelectItem><SelectItem value="expense">Despesa</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div><div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div></div><div className="space-y-1.5"><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div><div className="space-y-1.5"><Label>Paciente (opcional)</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem paciente</SelectItem>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Status</Label><Select value={status} onValueChange={(v) => setStatus(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem></SelectContent></Select></div></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button></div></DialogContent></Dialog>;
}
