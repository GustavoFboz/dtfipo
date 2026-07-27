import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialPermissions } from "@/lib/financial/permissions/hooks";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Receipt,
  ArrowUpRight,
  PiggyBank,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  component: FinanceiroDashboard,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function useDashboardData(clinicId: string | null) {
  return useQuery({
    queryKey: ["financeiro", "dashboard", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const [wallets, earnings, cases] = await Promise.all([
        db.from("user_wallets").select("balance").eq("clinic_id", clinicId),
        db
          .from("financial_professional_earnings")
          .select("amount, lifecycle_status, created_at")
          .eq("clinic_id", clinicId),
        db
          .from("cases")
          .select("gross_amount, status, entry_date")
          .eq("clinic_id", clinicId),
      ]);
      const walletTotal = (wallets.data ?? []).reduce(
        (s: number, w: { balance: number | null }) => s + Number(w.balance ?? 0),
        0,
      );
      const eList = (earnings.data ?? []) as Array<{ amount: number; lifecycle_status: string }>;
      const production = eList
        .filter((e) => e.lifecycle_status !== "canceled")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const pending = eList
        .filter((e) => e.lifecycle_status === "pending")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const paid = eList
        .filter((e) => e.lifecycle_status === "paid")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const grossCases = (cases.data ?? []).reduce(
        (s: number, c: { gross_amount: number | null }) => s + Number(c.gross_amount ?? 0),
        0,
      );
      return {
        walletTotal,
        production,
        pending,
        paid,
        grossCases,
        casesCount: cases.data?.length ?? 0,
      };
    },
  });
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "emerald" | "rose";
}) {
  const accentMap: Record<string, string> = {
    primary: "bg-primary/5 text-primary border-primary/10",
    emerald: "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10",
    rose: "bg-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/10",
  };
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
      <div className="flex items-start justify-between mb-6">
        <div className={`p-3 rounded-2xl border ${accentMap[accent]}`}>
          <Icon className="h-4 w-4 stroke-[1.4px]" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </div>
        <div className="text-3xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
          {brl(value)}
        </div>
        <div className="text-xs font-light text-slate-500 dark:text-slate-400">{hint}</div>
      </div>
    </div>
  );
}

function FinanceiroDashboard() {
  const { role, clinicId, loading } = useFinancialPermissions();
  const isAdmin = role === "CEO" || role === "ADMIN" || role === "FINANCEIRO" || role === "GESTOR";
  const { data, isLoading } = useDashboardData(clinicId);

  if (!loading && !isAdmin) {
    // Non-admins go straight to their personal financial page.
    return <Navigate to="/meu-financeiro" />;
  }

  const d = data ?? { walletTotal: 0, production: 0, pending: 0, paid: 0, grossCases: 0, casesCount: 0 };

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <LayoutDashboard className="h-3 w-3" />
          Visão geral
        </div>
        <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
          Dashboard financeiro
        </h1>
        <p className="text-sm md:text-base font-light text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
          Valores calculados em tempo real a partir dos casos, carteiras e produções cadastrados.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard label="Saldo em carteiras" value={d.walletTotal} hint="Soma de todas as carteiras" icon={Wallet} />
        <KpiCard label="Produção acumulada" value={d.production} hint="Ganhos profissionais" icon={TrendingUp} accent="emerald" />
        <KpiCard label="Pendente de aprovação" value={d.pending} hint="Aguardando aprovação" icon={ArrowUpRight} accent="rose" />
        <KpiCard label="Total pago" value={d.paid} hint="Ganhos já quitados" icon={PiggyBank} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-primary stroke-[1.4px]" />
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70">Produção de casos</div>
          </div>
          <div className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em] mb-4">
            {brl(d.grossCases)}
          </div>
          <div className="text-xs font-light text-slate-500 dark:text-slate-400">
            {d.casesCount} caso(s) cadastrado(s)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4 text-primary stroke-[1.4px]" />
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70">Atalhos</div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Link to="/financeiro/producao" className="px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm font-light hover:border-primary/30 hover:text-primary transition">Produção</Link>
            <Link to="/financeiro/carteiras" className="px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm font-light hover:border-primary/30 hover:text-primary transition">Carteiras</Link>
            <Link to="/financeiro/aprovacoes" className="px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm font-light hover:border-primary/30 hover:text-primary transition">Aprovações</Link>
            <Link to="/financeiro/fechamento" className="px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm font-light hover:border-primary/30 hover:text-primary transition">Fechamento</Link>
          </div>
          {isLoading ? (
            <div className="text-[11px] text-slate-400 mt-4">Carregando…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
