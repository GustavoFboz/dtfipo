import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCadistas } from "@/lib/api";
import type { CaseRow, Cadista } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";
import { ToothCaseDialog } from "@/components/teeth/ToothCaseDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cadistas/$cadistaId")({
  component: CadistaProfilePage,
});

const CASE_SELECT = `
  *,
  patient:patients(*),
  doctor:doctors(*),
  cadista:cadistas(*),
  case_type:case_types!cases_case_type_id_fkey(*),
  tooth_color:tooth_colors(*),
  current_stage:stages!cases_current_stage_id_fkey(*)
`;

type StatusFilter = "all" | "active" | "finished" | "cancelled";

function CadistaProfilePage() {
  const { cadistaId } = Route.useParams();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rate, setRate] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(`cadista:${cadistaId}:rate`) ?? 0);
  });
  const [selected, setSelected] = useState<CaseRow | null>(null);

  useEffect(() => {
    localStorage.setItem(`cadista:${cadistaId}:rate`, String(rate));
  }, [rate, cadistaId]);

  const cadistaQ = useQuery({
    queryKey: ["cadista", cadistaId],
    queryFn: async () => {
      const list = await fetchCadistas();
      return list.find((x) => x.id === cadistaId) ?? null;
    },
  });

  const profileQ = useQuery({
    queryKey: ["cadista_profile", cadistaId, cadistaQ.data?.user_id],
    enabled: !!cadistaQ.data?.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", cadistaQ.data!.user_id!)
        .maybeSingle();
      return data;
    },
  });

  const casesQ = useQuery({
    queryKey: ["cadista_cases_all", cadistaId, status],
    queryFn: async () => {
      let q = supabase.from("cases").select(CASE_SELECT).eq("cadista_id", cadistaId);
      if (status === "active") q = q.eq("status", "active");
      else if (status === "finished") q = q.eq("status", "finished");
      else if (status === "cancelled") q = q.in("status", ["cancelled", "canceled"]);
      const { data, error } = await q.order("delivery_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CaseRow[];
    },
  });

  const cases = casesQ.data ?? [];
  const totalTeeth = useMemo(
    () => cases.reduce((sum, c) => sum + (c.teeth_numbers?.length ?? 0), 0),
    [cases],
  );
  const totalValue = totalTeeth * rate;

  return (
    <div className="min-h-full font-light max-w-[1200px] mx-auto w-full px-6 md:px-16 pb-32">
      <div className="pt-8">
        <Link
          to="/lab"
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> voltar
        </Link>
      </div>

      <header className="pt-8 pb-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="relative h-24 w-24 rounded-full overflow-hidden border border-slate-200 bg-slate-50 grid place-items-center">
            {profileQ.data?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileQ.data.avatar_url}
                alt={cadistaQ.data?.name ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-9 w-9 text-slate-300 stroke-[1.2px]" />
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400 font-medium">Cadista</div>
            <h1 className="text-5xl md:text-6xl font-extralight text-slate-900 tracking-[-0.03em] leading-[1]">
              {cadistaQ.data?.name ?? "—"}
            </h1>
            <p className="text-slate-500 mt-2 text-sm">Trabalhos feitos pelo cadista</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.28em] text-slate-400 mb-1.5">
              Valor por dente
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={rate || ""}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                placeholder="0,00"
                className="pl-10 h-12 w-48 rounded-full border-slate-200 focus-visible:ring-1 focus-visible:ring-[#0C84FA] focus-visible:ring-offset-0 text-right font-light"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-1 p-1 rounded-full bg-slate-50 border border-slate-100 w-fit mb-6">
        {(["all", "active", "finished", "cancelled"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-4 h-8 rounded-full text-[12px] font-normal transition-colors",
              status === s ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {s === "all" ? "Todos" : s === "active" ? "Em andamento" : s === "finished" ? "Finalizados" : "Cancelados"}
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center px-6 py-3 text-[10px] uppercase tracking-[0.08em] text-slate-400 border-b border-slate-100">
          <div>Caso</div>
          <div className="px-4">Dentes</div>
          <div className="px-4">Entrega</div>
          <div className="px-4 text-right">Subtotal</div>
        </div>
        {casesQ.isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando…</div>
        ) : cases.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Nenhum caso encontrado.</div>
        ) : (
          <ul>
            {cases.map((c) => {
              const n = c.teeth_numbers?.length ?? 0;
              const subtotal = n * rate;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c)}
                    className="w-full grid grid-cols-[1fr_auto_auto_auto] items-center px-6 py-4 border-b border-slate-50 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] text-slate-900 truncate">
                        {c.case_number != null && <span className="text-slate-400 mr-2">#{c.case_number}</span>}
                        {c.patient?.name ?? "—"}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {c.case_type?.name ?? ""} · {c.doctor?.name ?? ""}
                      </div>
                    </div>
                    <div className="px-4 text-[13px] text-slate-700 tabular-nums">{n}</div>
                    <div className="px-4 text-[12px] text-slate-500">{fmtBR(c.delivery_date)}</div>
                    <div className="px-4 text-[13px] text-slate-800 tabular-nums text-right min-w-[110px]">
                      {brl(subtotal)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-100 bg-white/85 backdrop-blur-lg">
        <div className="max-w-[1200px] mx-auto px-6 md:px-16 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Dentes</div>
              <div className="text-2xl font-extralight text-slate-900 tabular-nums">{totalTeeth}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Casos</div>
              <div className="text-2xl font-extralight text-slate-900 tabular-nums">{cases.length}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Total</div>
            <div className="text-3xl font-extralight tabular-nums" style={{ color: "#0C84FA" }}>
              {brl(totalValue)}
            </div>
          </div>
        </div>
      </div>

      <ToothCaseDialog
        caseRow={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// silence unused import (Cadista type kept for clarity)
export type _CadistaTypeRef = Cadista;