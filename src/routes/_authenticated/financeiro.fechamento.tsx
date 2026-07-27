import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Unlock, Play, CheckCircle2, DollarSign, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/fechamento")({
  component: FechamentoPage,
});

type ClosingStatus = "OPEN" | "PROCESSING" | "CLOSED" | "PAID";
type Closing = {
  id: string;
  clinic_id: string;
  year: number;
  month: number;
  status: ClosingStatus;
  total_production: number;
  total_approved: number;
  total_paid: number;
  closed_at: string | null;
  paid_at: string | null;
  reopened_at: string | null;
};

const brl = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function FechamentoPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await db.from("profiles").select("clinic_id, role").eq("id", user!.id).maybeSingle();
      return data as { clinic_id: string | null; role: string | null } | null;
    },
  });
  const clinicId = profile?.clinic_id ?? null;
  const isCEO = profile?.role === "CEO";

  const { data: closings = [] } = useQuery({
    queryKey: ["closings", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await db
        .from("financial_closings")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Closing[];
    },
  });

  const current = useMemo(
    () => closings.find((c) => c.year === year && c.month === month) ?? null,
    [closings, year, month],
  );

  const openMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("open_financial_closing", {
        _clinic: clinicId, _year: year, _month: month,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha ao abrir");
      return data;
    },
    onSuccess: () => { toast.success("Fechamento aberto/atualizado"); qc.invalidateQueries({ queryKey: ["closings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const advanceMut = useMutation({
    mutationFn: async (to: ClosingStatus) => {
      if (!current) throw new Error("Abra o fechamento primeiro");
      const { data, error } = await db.rpc("advance_financial_closing", { _id: current.id, _to: to });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha");
      return data;
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["closings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenMut = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Sem fechamento");
      const reason = window.prompt("Motivo da reabertura:") ?? undefined;
      const { data, error } = await db.rpc("reopen_financial_closing", { _id: current.id, _reason: reason });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha");
      return data;
    },
    onSuccess: () => { toast.success("Fechamento reaberto"); qc.invalidateQueries({ queryKey: ["closings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">Financeiro</div>
        <h1 className="text-3xl font-extralight tracking-[-0.02em]">Fechamento</h1>
        <p className="text-sm text-slate-500 max-w-2xl font-light">
          Consolide o período. Depois de <b>CLOSED</b> ou <b>PAID</b> nenhuma produção do mês pode ser alterada.
          A reabertura é restrita ao CEO.
        </p>
      </header>

      {/* Seletor de período */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 items-end">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => openMut.mutate()} disabled={!clinicId || openMut.isPending} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Abrir / Recalcular
        </Button>
      </div>

      {/* Cards do período */}
      <div className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Período</div>
            <div className="text-2xl font-light">{MONTHS[month - 1]} {year}</div>
          </div>
          <StatusBadge status={current?.status ?? "OPEN"} exists={!!current} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Metric label="Produções" value={current?.total_production ?? 0} />
          <Metric label="Aprovado" value={current?.total_approved ?? 0} />
          <Metric label="Pago" value={current?.total_paid ?? 0} />
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" disabled={!current || current.status !== "OPEN"}
            onClick={() => advanceMut.mutate("PROCESSING")}>
            <Play className="h-4 w-4" /> Iniciar processamento
          </Button>
          <Button variant="outline" size="sm" className="gap-2"
            disabled={!current || !["OPEN","PROCESSING"].includes(current.status)}
            onClick={() => advanceMut.mutate("CLOSED")}>
            <Lock className="h-4 w-4" /> Fechar
          </Button>
          <Button variant="outline" size="sm" className="gap-2"
            disabled={!current || current.status !== "CLOSED"}
            onClick={() => advanceMut.mutate("PAID")}>
            <DollarSign className="h-4 w-4" /> Marcar como pago
          </Button>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" className="gap-2 text-rose-600 hover:text-rose-700"
              disabled={!current || !["CLOSED","PAID"].includes(current.status) || !isCEO}
              title={!isCEO ? "Apenas o CEO pode reabrir" : undefined}
              onClick={() => reopenMut.mutate()}>
              <Unlock className="h-4 w-4" /> Reabrir {isCEO ? "" : "(CEO)"}
            </Button>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 text-sm font-medium">Histórico</div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {closings.length === 0 && <div className="p-8 text-sm text-slate-500 text-center">Nenhum fechamento ainda.</div>}
          {closings.map((c) => (
            <div key={c.id} className="p-5 flex items-center gap-4 flex-wrap">
              <div className="text-sm w-32">{MONTHS[c.month - 1]} {c.year}</div>
              <StatusBadge status={c.status} exists />
              <div className="ml-auto flex items-center gap-6 text-sm tabular-nums">
                <span className="text-slate-500">Prod. <b className="text-slate-900 dark:text-slate-100">{brl(c.total_production)}</b></span>
                <span className="text-slate-500">Aprov. <b className="text-slate-900 dark:text-slate-100">{brl(c.total_approved)}</b></span>
                <span className="text-slate-500">Pago <b className="text-slate-900 dark:text-slate-100">{brl(c.total_paid)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-3xl font-extralight mt-2 tabular-nums">{brl(value)}</div>
    </div>
  );
}

function StatusBadge({ status, exists }: { status: ClosingStatus; exists: boolean }) {
  if (!exists) return <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Não aberto</Badge>;
  const map: Record<ClosingStatus, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
    OPEN:       { label: "OPEN",       cls: "bg-slate-100 text-slate-700 border-slate-200", Icon: Unlock },
    PROCESSING: { label: "PROCESSING", cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Play },
    CLOSED:     { label: "CLOSED",     cls: "bg-indigo-50 text-indigo-700 border-indigo-200",Icon: Lock },
    PAID:       { label: "PAID",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  };
  const m = map[status];
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}
