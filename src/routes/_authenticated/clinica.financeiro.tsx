import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Search, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchPatients } from "@/lib/api";
import { fetchClinicContext, fetchClinicFinancialEntries, saveClinicFinancialEntry } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/financeiro")({ component: ClinicFinancePage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

function ClinicFinancePage() {
  return <ClinicPageGuard permission="clinical.financial"><Finance /></ClinicPageGuard>;
}

function Finance() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const entries = useQuery({ queryKey: ["clinic_financial", month], queryFn: () => fetchClinicFinancialEntries(month) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, staleTime: 60_000 });

  const values = useMemo(() => {
    const list = entries.data ?? [];
    const active = list.filter((x: any) => x.status !== "cancelled");
    const revenue = active.filter((x: any) => x.kind === "revenue").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    const expense = active.filter((x: any) => x.kind === "expense").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    const pending = active.filter((x: any) => x.status === "pending").reduce((s: number, x: any) => s + Number(x.amount_cents || 0), 0);
    return { revenue, expense, pending, balance: revenue - expense };
  }, [entries.data]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (entries.data ?? [])
      .filter((e: any) => kindFilter === "all" || e.kind === kindFilter)
      .filter((e: any) => statusFilter === "all" || (statusFilter === "active" ? e.status !== "cancelled" : e.status === statusFilter))
      .filter((e: any) => !term || [e.description, e.category, e.patient?.name].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [entries.data, query, kindFilter, statusFilter]);

  const markPaid = useMutation({
    mutationFn: (entry: any) => saveClinicFinancialEntry({
      id: entry.id,
      clinic_id: entry.clinic_id ?? context.data?.clinicId,
      kind: entry.kind,
      description: entry.description,
      category: entry.category ?? null,
      amount_cents: Number(entry.amount_cents || 0),
      due_date: entry.due_date ?? null,
      status: "paid",
      patient_id: entry.patient_id ?? null,
    }),
    onSuccess: () => { toast.success("Lançamento marcado como pago"); qc.invalidateQueries({ queryKey: ["clinic_financial"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function newEntry() { setEditing(null); setOpen(true); }
  function editEntry(entry: any) { setEditing(entry); setOpen(true); }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 lg:px-12">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Gestão clínica</div>
          <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Financeiro</h1>
          <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">Um financeiro enxuto para o consultório: entradas, saídas e pendências sem misturar a operação do laboratório.</p>
        </div>
        <Button onClick={newEntry} className="h-11 self-start rounded-full bg-[#1e8f87] px-5 text-white hover:bg-[#177a73] lg:self-auto"><Plus className="mr-2 h-4 w-4" /> Novo lançamento</Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={TrendingUp} label="Receitas" value={brl(values.revenue)} tone="positive" />
        <Metric icon={TrendingDown} label="Despesas" value={brl(values.expense)} tone="negative" />
        <Metric icon={WalletCards} label="Saldo" value={brl(values.balance)} tone="neutral" />
        <Metric icon={WalletCards} label="Pendentes" value={brl(values.pending)} tone="warning" />
      </div>

      <div className="mt-5 grid gap-2 rounded-[24px] border border-slate-200/70 bg-white p-3 md:grid-cols-[160px_minmax(220px,1fr)_160px_160px] dark:border-white/10 dark:bg-slate-950">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-xl border-slate-100 shadow-none dark:border-white/10" />
        <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lançamento ou paciente" className="h-10 rounded-xl border-slate-100 bg-slate-50/60 pl-10 shadow-none dark:border-white/10 dark:bg-white/[0.03]" /></div>
        <Select value={kindFilter} onValueChange={setKindFilter}><SelectTrigger className="h-10 rounded-xl border-slate-100 shadow-none dark:border-white/10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="revenue">Receitas</SelectItem><SelectItem value="expense">Despesas</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-10 rounded-xl border-slate-100 shadow-none dark:border-white/10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativos</SelectItem><SelectItem value="all">Todos</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem></SelectContent></Select>
      </div>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="hidden grid-cols-[120px_minmax(280px,1fr)_150px_150px_190px] gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 md:grid dark:border-white/5 dark:bg-white/[0.02]">
          <span>Data</span><span>Lançamento</span><span>Valor</span><span>Status</span><span>Ações</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {visible.map((e: any) => (
            <div key={e.id} className="grid gap-3 px-5 py-4 md:grid-cols-[120px_minmax(280px,1fr)_150px_150px_190px] md:items-center md:gap-4">
              <div className="text-xs font-light text-slate-400">{e.due_date ? new Date(`${e.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</div>
              <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.description}</div><div className="mt-0.5 truncate text-[11px] font-light text-slate-400">{e.category || (e.kind === "revenue" ? "Receita" : "Despesa")}{e.patient?.name ? ` · ${e.patient.name}` : ""}</div></div>
              <div className={`text-sm font-medium ${e.kind === "revenue" ? "text-emerald-600" : "text-rose-500"}`}>{e.kind === "expense" ? "−" : "+"}{brl(Number(e.amount_cents || 0))}</div>
              <div><Status status={e.status} /></div>
              <div className="flex items-center gap-1">
                {e.status === "pending" && <Button variant="ghost" size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate(e)} className="h-8 rounded-lg px-2 text-[11px] text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/20"><Check className="mr-1 h-3.5 w-3.5" /> Pago</Button>}
                <Button variant="ghost" size="sm" onClick={() => editEntry(e)} className="h-8 rounded-lg px-2 text-[11px] text-slate-500"><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
              </div>
            </div>
          ))}
        </div>
        {entries.isLoading && <div className="py-16 text-center text-sm font-light text-slate-400">Carregando lançamentos…</div>}
        {!entries.isLoading && visible.length === 0 && <div className="py-16 text-center text-sm font-light text-slate-400">Nenhum lançamento para os filtros selecionados.</div>}
      </section>

      <FinancialSheet key={`${editing?.id ?? "new"}:${open ? "open" : "closed"}`} open={open} onOpenChange={setOpen} entry={editing} clinicId={context.data?.clinicId ?? null} patients={patients.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["clinic_financial"] })} />
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  const iconClass = tone === "positive" ? "text-emerald-500" : tone === "negative" ? "text-rose-500" : tone === "warning" ? "text-amber-500" : "text-[#1e8f87]";
  return <div className="rounded-[22px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-[11px] font-light text-slate-400"><Icon className={`h-4 w-4 ${iconClass}`} />{label}</div><div className="mt-4 truncate text-2xl font-light tracking-tight text-slate-900 dark:text-white">{value}</div></div>;
}

function Status({ status }: { status: string }) {
  const cls = status === "paid" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300" : status === "cancelled" ? "bg-slate-100 text-slate-400 dark:bg-white/5" : "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
  const label = status === "paid" ? "Pago" : status === "cancelled" ? "Cancelado" : "Pendente";
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${cls}`}>{label}</span>;
}

function FinancialSheet({ open, onOpenChange, entry, clinicId, patients, onSaved }: any) {
  const [kind, setKind] = useState<"revenue" | "expense">(entry?.kind ?? "revenue");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [amount, setAmount] = useState(entry ? String(Number(entry.amount_cents || 0) / 100).replace(".", ",") : "");
  const [dueDate, setDueDate] = useState(entry?.due_date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<"pending" | "paid" | "cancelled">(entry?.status ?? "pending");
  const [patientId, setPatientId] = useState(entry?.patient_id ?? "none");

  const save = useMutation({
    mutationFn: () => {
      if (!clinicId || !description.trim()) throw new Error("Preencha a descrição.");
      const cents = Math.round(Number(amount.replace(/\./g, "").replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new Error("Valor inválido.");
      return saveClinicFinancialEntry({ id: entry?.id, clinic_id: clinicId, kind, description: description.trim(), category: category.trim() || null, amount_cents: cents, due_date: dueDate || null, status, patient_id: patientId === "none" ? null : patientId });
    },
    onSuccess: () => { toast.success(entry ? "Lançamento atualizado" : "Lançamento criado"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-slate-100 bg-white p-0 sm:max-w-[500px] dark:border-white/10 dark:bg-[#0b0e13]">
        <div className="border-b border-slate-100 px-6 py-6 dark:border-white/5"><SheetHeader><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">Financeiro clínico</div><SheetTitle className="text-2xl font-light tracking-tight">{entry ? "Editar lançamento" : "Novo lançamento"}</SheetTitle><SheetDescription className="font-light">Registre somente o necessário para manter a operação clara.</SheetDescription></SheetHeader></div>
        <div className="space-y-5 px-6 py-6">
          <div className="space-y-1.5"><Label>Tipo</Label><Select value={kind} onValueChange={(v) => setKind(v as any)}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="revenue">Receita</SelectItem><SelectItem value="expense">Despesa</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-11 rounded-xl" placeholder="Ex.: Consulta particular" /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 rounded-xl" placeholder="0,00" /></div><div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11 rounded-xl" /></div></div>
          <div className="space-y-1.5"><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 rounded-xl" placeholder="Consulta, material, aluguel…" /></div>
          <div className="space-y-1.5"><Label>Paciente (opcional)</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem paciente</SelectItem>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Status</Label><Select value={status} onValueChange={(v) => setStatus(v as any)}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem></SelectContent></Select></div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur dark:border-white/5 dark:bg-[#0b0e13]/95"><Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl"><X className="mr-1 h-4 w-4" /> Fechar</Button><Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl bg-[#1e8f87] text-white hover:bg-[#177a73]">{save.isPending ? "Salvando…" : "Salvar"}</Button></div>
      </SheetContent>
    </Sheet>
  );
}
