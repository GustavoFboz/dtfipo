import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Receipt,
  Search,
  Filter,
  Plus,
  Minus,
  Gift,
  Percent,
  CheckCircle2,
  Clock,
  XCircle,
  BadgeCheck,
  Calculator,
  Upload,
  Printer,
  FileText,
  ArrowRight,
  ChevronRight,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/pagamentos")({
  component: PagamentosPage,
});

// ---------------- types & mock ----------------
type PayStatus = "calculado" | "pendente" | "aprovado" | "pago" | "cancelado";

type Adjustment = {
  id: string;
  kind: "adiantamento" | "desconto" | "bonus" | "retencao";
  label: string;
  amount: number; // signed relative to base (adiantamento/desconto/retencao: negative; bonus: positive)
};

type Payment = {
  id: string;
  code: string;
  professional: string;
  period: string;
  cases: number;
  teeth: number;
  base: number;
  status: PayStatus;
  createdAt: string;
  paidAt?: string;
  adjustments: Adjustment[];
  receipts: { name: string; size: string }[];
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const mockPayments: Payment[] = [];

const totalOf = (p: Payment) =>
  p.base + p.adjustments.reduce((s, a) => s + a.amount, 0);

// ---------------- status meta ----------------
const statusMeta: Record<
  PayStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string; dot: string }
> = {
  calculado: {
    label: "Calculado",
    icon: Calculator,
    cls: "bg-slate-500/5 text-slate-600 dark:text-slate-300 border-slate-500/10",
    dot: "bg-slate-400",
  },
  pendente: {
    label: "Pendente",
    icon: Clock,
    cls: "bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/10",
    dot: "bg-amber-400",
  },
  aprovado: {
    label: "Aprovado",
    icon: BadgeCheck,
    cls: "bg-primary/5 text-primary border-primary/10",
    dot: "bg-primary",
  },
  pago: {
    label: "Pago",
    icon: CheckCircle2,
    cls: "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10",
    dot: "bg-emerald-500",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    cls: "bg-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/10",
    dot: "bg-rose-400",
  },
};

const adjustmentMeta: Record<
  Adjustment["kind"],
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  adiantamento: {
    label: "Adiantamento",
    icon: ArrowRight,
    cls: "bg-amber-500/5 text-amber-600 dark:text-amber-400",
  },
  desconto: {
    label: "Desconto",
    icon: Minus,
    cls: "bg-rose-500/5 text-rose-600 dark:text-rose-400",
  },
  bonus: { label: "Bônus", icon: Gift, cls: "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
  retencao: { label: "Retenção", icon: Percent, cls: "bg-slate-500/5 text-slate-600 dark:text-slate-300" },
};

// ---------------- page ----------------
function PagamentosPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PayStatus | "todos">("todos");
  const [selected, setSelected] = useState<Payment | null>(null);

  const list = useMemo(
    () =>
      mockPayments.filter(
        (p) =>
          (filter === "todos" || p.status === filter) &&
          (query === "" ||
            p.professional.toLowerCase().includes(query.toLowerCase()) ||
            p.code.toLowerCase().includes(query.toLowerCase())),
      ),
    [query, filter],
  );

  const counts = useMemo(() => {
    const c: Record<PayStatus | "todos", number> = {
      todos: mockPayments.length,
      calculado: 0,
      pendente: 0,
      aprovado: 0,
      pago: 0,
      cancelado: 0,
    };
    mockPayments.forEach((p) => (c[p.status] += 1));
    return c;
  }, []);

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Header */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <Receipt className="h-3 w-3" />
          Pagamentos
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
              Fluxo de pagamentos
            </h1>
            <p className="mt-2 text-sm md:text-base font-light text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
              Calculado → Pendente → Aprovado → Pago. Com adiantamentos, descontos, bônus e retenções.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-sm hover:bg-primary/90 transition">
            <Plus className="h-3.5 w-3.5" />
            Novo pagamento
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar profissional ou código"
              className="w-full pl-9 pr-3 py-2.5 text-sm font-light rounded-full bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 outline-none focus:border-primary/40"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1">
            {(["todos", "calculado", "pendente", "aprovado", "pago", "cancelado"] as const).map((k) => {
              const active = filter === k;
              const label = k === "todos" ? "Todos" : statusMeta[k].label;
              return (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-primary/40"
                  }`}
                >
                  {label}
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"
                    }`}
                  >
                    {counts[k]}
                  </span>
                </button>
              );
            })}
            <button className="hidden md:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-500 hover:border-primary/40">
              <Filter className="h-3 w-3" />
              Mais filtros
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        {list.map((p) => {
          const meta = statusMeta[p.status];
          const total = totalOf(p);
          const Adjs = p.adjustments;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="text-left bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:border-primary/30 transition"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={`p-3 rounded-2xl border ${meta.cls}`}>
                    <meta.icon className="h-4 w-4 stroke-[1.4px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        {p.code}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-lg font-light text-slate-900 dark:text-slate-100 truncate">
                      {p.professional}
                    </div>
                    <div className="text-xs font-light text-slate-500 dark:text-slate-400 truncate">
                      {p.period} • {p.cases} casos • {p.teeth} dentes
                    </div>
                  </div>
                </div>

                {Adjs.length > 0 && (
                  <div className="hidden md:flex items-center gap-2 flex-wrap max-w-[280px]">
                    {Adjs.slice(0, 2).map((a) => {
                      const am = adjustmentMeta[a.kind];
                      return (
                        <span
                          key={a.id}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${am.cls}`}
                        >
                          <am.icon className="h-3 w-3" />
                          {am.label}
                        </span>
                      );
                    })}
                    {Adjs.length > 2 && (
                      <span className="text-[10px] text-slate-400">+{Adjs.length - 2}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6">
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Total
                    </div>
                    <div className="text-xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
                      {brl(total)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="text-center py-16 text-sm font-light text-slate-500">
            Nenhum pagamento encontrado.
          </div>
        )}
      </div>

      {selected && <PaymentDrawer payment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ---------------- drawer ----------------
function PaymentDrawer({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const meta = statusMeta[payment.status];
  const total = totalOf(payment);
  const positives = payment.adjustments.filter((a) => a.amount > 0);
  const negatives = payment.adjustments.filter((a) => a.amount < 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-[520px] h-full bg-white dark:bg-slate-900 overflow-y-auto border-l border-slate-100 dark:border-slate-800">
        <div className="p-6 md:p-8 space-y-8">
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-2">
                {payment.code}
              </div>
              <div className="text-2xl md:text-3xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
                {payment.professional}
              </div>
              <div className="text-xs font-light text-slate-500 mt-1">
                {payment.period} • criado em {payment.createdAt}
              </div>
              <span
                className={`mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          {/* flow */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-3">
              Fluxo
            </div>
            <div className="flex items-center gap-1">
              {(["calculado", "pendente", "aprovado", "pago"] as PayStatus[]).map((s, i, arr) => {
                const order: PayStatus[] = ["calculado", "pendente", "aprovado", "pago"];
                const currentIdx = order.indexOf(payment.status);
                const cancelled = payment.status === "cancelado";
                const done = !cancelled && i <= currentIdx;
                const m = statusMeta[s];
                return (
                  <div key={s} className="flex-1 flex items-center gap-1">
                    <div
                      className={`flex-1 px-2 py-2 rounded-2xl border text-[10px] font-semibold text-center ${
                        done ? m.cls : "bg-slate-50 dark:bg-slate-800/40 text-slate-400 border-transparent"
                      }`}
                    >
                      {m.label}
                    </div>
                    {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* base */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  Base calculada
                </div>
                <div className="text-xs font-light text-slate-500 mt-1">
                  {payment.cases} casos • {payment.teeth} dentes
                </div>
              </div>
              <div className="text-xl font-extralight text-slate-900 dark:text-slate-100">
                {brl(payment.base)}
              </div>
            </div>
          </div>

          {/* adjustments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Ajustes
              </div>
              <button className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>

            {payment.adjustments.length === 0 && (
              <div className="text-xs font-light text-slate-400 py-4">Nenhum ajuste aplicado.</div>
            )}

            {[...positives, ...negatives].map((a) => {
              const am = adjustmentMeta[a.kind];
              const pos = a.amount > 0;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl ${am.cls}`}>
                      <am.icon className="h-3.5 w-3.5 stroke-[1.4px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-light text-slate-900 dark:text-slate-100 truncate">
                        {a.label}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        {am.label}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {pos ? "+" : ""}
                    {brl(a.amount)}
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
              {(["adiantamento", "desconto", "bonus", "retencao"] as Adjustment["kind"][]).map((k) => {
                const am = adjustmentMeta[k];
                return (
                  <button
                    key={k}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-medium border border-slate-200 dark:border-slate-800 hover:border-primary/40 transition ${am.cls}`}
                  >
                    <am.icon className="h-3 w-3" />
                    {am.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* total */}
          <div className="p-5 rounded-[1.5rem] bg-primary/5 border border-primary/10">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70">
                Total líquido
              </div>
              <div className="text-3xl font-extralight text-primary tracking-[-0.02em]">
                {brl(total)}
              </div>
            </div>
            {payment.paidAt && (
              <div className="text-[11px] font-light text-slate-500 mt-2">
                Pago em {payment.paidAt}
              </div>
            )}
          </div>

          {/* receipts */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Comprovantes
            </div>
            {payment.receipts.length > 0 ? (
              <div className="space-y-2">
                {payment.receipts.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800"
                  >
                    <div className="p-2 rounded-xl bg-primary/5 text-primary">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-light text-slate-900 dark:text-slate-100 truncate">
                        {r.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        {r.size}
                      </div>
                    </div>
                    <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs font-light text-slate-400">
                Nenhum comprovante anexado.
              </div>
            )}
            <button
              disabled
              title="Em breve"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-400 cursor-not-allowed"
            >
              <Upload className="h-3.5 w-3.5" />
              Anexar comprovante (em breve)
            </button>
          </div>

          {/* actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">
              <Printer className="h-3.5 w-3.5" />
              Gerar comprovante interno
            </button>
            <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-primary/40">
              Avançar status
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
