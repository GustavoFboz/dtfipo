import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Clock,
  CalendarClock,
  TrendingUp,
  Sparkles,
  Building2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { EarningLifecycleStatus, ProfessionalEarning } from "@/lib/financial/earnings";

export const Route = createFileRoute("/_authenticated/financeiro/previsao")({
  component: PrevisaoPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const iso = (d: Date) => d.toISOString().slice(0, 10);

function firstDayOfMonth(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}
function lastDayOfMonth(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1 + offset, 0);
}

type StatusFilter = "all" | EarningLifecycleStatus;

function PrevisaoPage() {
  const [clinicId, setClinicId] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState<string>(iso(firstDayOfMonth(0)));
  const [to, setTo] = useState<string>(iso(lastDayOfMonth(0)));

  // Usuário atual
  const { data: user } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const userId = user?.id ?? null;

  // Empresas do usuário
  const { data: clinics = [] } = useQuery({
    queryKey: ["previsao", "clinics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_members")
        .select("clinic_id, clinics(id, name)")
        .eq("user_id", userId!)
        .eq("status", "active");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.clinics?.id ?? r.clinic_id, name: r.clinics?.name ?? "—" }));
    },
  });

  // Ganhos previstos (somente leitura)
  const { data: earnings = [], isLoading } = useQuery({
    queryKey: ["previsao", "earnings", userId, clinicId, status, from, to],
    enabled: !!userId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("financial_professional_earnings")
        .select("*")
        .eq("professional_id", userId!)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (clinicId !== "all") q = q.eq("clinic_id", clinicId);
      if (status !== "all") q = q.eq("lifecycle_status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProfessionalEarning[];
    },
  });

  const totals = useMemo(() => {
    const by = (fn: (e: ProfessionalEarning) => boolean) =>
      earnings.filter(fn).reduce((s, e) => s + Number(e.amount || 0), 0);

    const producaoAtual = by((e) => e.lifecycle_status !== "canceled");
    const pendentes = by((e) => e.lifecycle_status === "pending");
    const futuros = by((e) => ["pending", "approved", "available"].includes(e.lifecycle_status));
    const proxFechamento = by((e) => ["approved", "available"].includes(e.lifecycle_status));

    return { producaoAtual, pendentes, futuros, proxFechamento };
  }, [earnings]);

  const cards = [
    {
      label: "Produção Atual",
      value: totals.producaoAtual,
      icon: TrendingUp,
      hint: "Total gerado no período (exceto cancelados)",
      accent: "text-primary",
    },
    {
      label: "Valores Pendentes",
      value: totals.pendentes,
      icon: Clock,
      hint: "Aguardando aprovação",
      accent: "text-amber-600",
    },
    {
      label: "Valores Futuros",
      value: totals.futuros,
      icon: CalendarClock,
      hint: "Ainda não pagos (pendente + aprovado + disponível)",
      accent: "text-indigo-600",
    },
    {
      label: "Próximo Fechamento",
      value: totals.proxFechamento,
      icon: Sparkles,
      hint: "Estimativa: aprovados + disponíveis",
      accent: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em] flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5" /> Motor de Previsão Financeira
        </div>
        <h1 className="text-3xl font-extralight tracking-[-0.02em] text-slate-900 dark:text-slate-100">
          Previsões
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-light">
          Visualize quanto você irá receber. Este painel é apenas informativo — nenhum pagamento é gerado aqui.
        </p>
      </header>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Building2 className="h-3 w-3" /> Empresa
          </Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="available">Disponível</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{c.label}</div>
                <Icon className={`h-4 w-4 ${c.accent}`} />
              </div>
              <div className="text-3xl font-extralight tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                {isLoading ? "—" : brl(c.value)}
              </div>
              <div className="text-[11px] text-slate-400">{c.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Detalhamento */}
      <div className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Detalhamento</div>
            <div className="text-[11px] text-slate-500">{earnings.length} lançamento(s) no período</div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Somente leitura</Badge>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading && <div className="p-6 text-sm text-slate-500">Carregando…</div>}
          {!isLoading && earnings.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              Nenhuma previsão encontrada para os filtros selecionados.
            </div>
          )}
          {earnings.map((e) => (
            <div key={e.id} className="p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-slate-900 dark:text-slate-100 truncate">
                  {e.role ?? "Participação"} · caso {e.case_id.slice(0, 8)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {new Date(e.created_at).toLocaleDateString("pt-BR")} · trigger: {e.trigger_status}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusPill status={e.lifecycle_status} />
                <div className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {brl(Number(e.amount || 0))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: EarningLifecycleStatus }) {
  const map: Record<EarningLifecycleStatus, { label: string; cls: string }> = {
    pending:   { label: "Pendente",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved:  { label: "Aprovado",   cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    available: { label: "Disponível", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    paid:      { label: "Pago",       cls: "bg-slate-100 text-slate-700 border-slate-200" },
    canceled:  { label: "Cancelado",  cls: "bg-rose-50 text-rose-700 border-rose-200" },
  };
  const m = map[status];
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}
