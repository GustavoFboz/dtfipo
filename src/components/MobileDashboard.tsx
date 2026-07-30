import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, SlidersHorizontal, MoreHorizontal } from "lucide-react";
import { fetchCases, fetchProfile } from "@/lib/api";
import { NewCaseDialog } from "./NewCaseDialog";
import { CaseDetailDialog } from "./CaseDetailDialog";
import type { CaseRow } from "@/lib/types";

type Filter = "all" | "active" | "late" | "month" | "finished";

function fmtBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function isLate(d: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(d + "T00:00:00") < today;
}

function isNew(c: CaseRow) {
  if (!c.entry_date) return false;
  const entry = new Date(c.entry_date + "T00:00:00").getTime();
  const now = Date.now();
  return now - entry < 3 * 24 * 60 * 60 * 1000; // 3 dias
}

export function MobileDashboard() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const active = useQuery({ queryKey: ["cases", "active"], queryFn: () => fetchCases("active") });
  const finished = useQuery({
    queryKey: ["cases", "finished"],
    queryFn: () => fetchCases("finished"),
    enabled: filter === "finished",
  });

  const list = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let src: CaseRow[] = active.data ?? [];
    if (filter === "finished") src = finished.data ?? [];
    else if (filter === "late") src = src.filter((c) => !c.finished_at && new Date(c.delivery_date + "T00:00:00") < today);
    else if (filter === "month") src = src.filter((c) => {
      const d = new Date((c.entry_date ?? "") + "T00:00:00");
      return !isNaN(d.getTime()) && d >= firstOfMonth;
    });
    const s = search.trim().toLowerCase();
    if (s) {
      src = src.filter((c) =>
        (c.patient?.name?.toLowerCase().includes(s)) ||
        (c.doctor?.name?.toLowerCase().includes(s)) ||
        (c.case_type?.name?.toLowerCase().includes(s)) ||
        (c.entry_date.includes(s) || c.delivery_date.includes(s))
      );
    }
    return src;
  }, [active.data, finished.data, filter, search]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="relative flex flex-col min-h-full pb-6">
      {/* Saudação — "Olá, Gustavo" com nome em azul */}
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-[38px] leading-[1.05] font-normal tracking-tight text-slate-800 dark:text-slate-100">
          Olá,<span className="text-[#4a9bff] font-medium">{firstName ? ` ${firstName}` : ""}</span>
        </h1>
        <p className="mt-1 text-[15px] font-light text-slate-400 dark:text-slate-500 tracking-tight">
          veja o que temos para hoje
        </p>
      </div>

      {/* Busca pill */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center gap-3 rounded-full bg-[#f1f3f5] dark:bg-slate-900 pl-5 pr-2 py-2.5">
          <Search className="h-4 w-4 text-slate-400 stroke-[1.8px]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            className="flex-1 bg-transparent outline-none text-[15px] font-light placeholder:text-slate-400 min-w-0"
          />
          <button
            aria-label="Filtros"
            className="h-9 w-9 rounded-full grid place-items-center text-slate-500 active:scale-90 transition-transform"
          >
            <SlidersHorizontal className="h-[18px] w-[18px] stroke-[1.6px]" />
          </button>
        </div>
      </div>


      {/* Chips removidos — filtros ficam apenas no botão de filtros da busca (fiel ao SVG) */}


      {/* Lista de casos (linhas) */}
      <div className="pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {(active.isLoading && filter !== "finished") || (filter === "finished" && finished.isLoading) ? (
          <div className="py-12 text-center text-slate-400 text-xs uppercase tracking-[0.08em]">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm font-light">Nenhum caso encontrado.</div>
        ) : (
          list.map((c, i) => (
            <MobileCaseRow key={c.id} c={c} index={i} onClick={() => setSelected(c)} />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setNewOpen(true)}
        aria-label="Nova entrada"
        className="fixed right-6 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full bg-[#4a9bff] text-white grid place-items-center shadow-[0_10px_28px_-6px_rgba(74,155,255,0.6)] active:scale-95 transition-transform"
      >
        <Plus className="h-6 w-6 stroke-[2px]" />
      </button>

      <NewCaseDialog open={newOpen} onOpenChange={setNewOpen} />
      <CaseDetailDialog caseRow={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function MobileCaseRow({ c, onClick }: { c: CaseRow; onClick: () => void }) {
  const late = !c.finished_at && isLate(c.delivery_date);
  const isNovo = isNew(c);
  const initial = (c.patient?.name?.[0] ?? "?").toUpperCase();
  return (
    <div className="px-6">
      <button
        onClick={onClick}
        className="w-full text-left py-5 border-b border-slate-100 dark:border-white/5 active:opacity-70 transition-opacity flex gap-4"
      >
        {/* Avatar à esquerda */}
        <div className="h-14 w-14 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 text-[18px] font-light overflow-hidden">
          {c.patient?.photo_url ? (
            <img src={c.patient.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            initial
          )}
        </div>

        {/* Conteúdo à direita */}
        <div className="flex-1 min-w-0">
          {/* Linha 1: nome + doutor + kebab */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-normal text-slate-800 dark:text-slate-100 tracking-tight truncate">
                {c.patient?.name ?? "—"}
              </div>
              <div className="text-[13px] font-light text-slate-400 truncate mt-0.5">
                {c.case_type?.name ?? "—"}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 gap-1">
              <MoreHorizontal className="h-5 w-5 text-slate-300 stroke-[1.6px]" />
              <div className="text-[13px] font-light text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                {c.doctor?.name ?? ""}
              </div>
            </div>
          </div>

          {/* Linha 2: datas + badge NOVO CASO */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="flex items-start gap-5">
              <div>
                <div className="text-[9px] font-medium text-slate-400 tracking-[0.14em] uppercase">Entrada</div>
                <div className="text-[12px] font-light text-slate-600 dark:text-slate-300 tabular-nums mt-0.5">
                  {fmtBR(c.entry_date)}
                </div>
              </div>
              <div>
                <div className={`text-[9px] font-medium tracking-[0.14em] uppercase ${late ? "text-rose-500" : "text-slate-400"}`}>Entrega</div>
                <div className={`text-[12px] font-light tabular-nums mt-0.5 ${late ? "text-rose-500" : "text-slate-600 dark:text-slate-300"}`}>
                  {fmtBR(c.delivery_date)}
                </div>
              </div>
            </div>
            {isNovo && (
              <span className="text-[10.5px] font-semibold text-white bg-[#34C759] px-3.5 py-1.5 rounded-full tracking-[0.08em] shadow-[0_4px_12px_-4px_rgba(52,199,89,0.5)]">
                NOVO CASO
              </span>
            )}

          </div>
        </div>
      </button>
    </div>
  );
}
