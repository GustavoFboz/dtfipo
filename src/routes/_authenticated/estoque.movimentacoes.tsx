import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { fetchStockMovements, MOVEMENT_LABEL } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes")({ component: MovimentacoesPage });

function MovimentacoesPage() {
  const movs = useQuery({ queryKey: ["stock_movements", "all"], queryFn: () => fetchStockMovements({ limit: 500 }) });
  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-primary leading-tight tracking-tight flex items-center gap-2">
          <History className="h-7 w-7" /> Movimentações de Estoque
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Log de todas as movimentações, mais recentes primeiro.</p>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Quando</th>
              <th className="p-3 text-left">Item</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-right">Δ</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3 text-left">Observação</th>
            </tr>
          </thead>
          <tbody>
            {(movs.data ?? []).map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{m.item?.name ?? "—"}</td>
                <td className="p-3">{MOVEMENT_LABEL[m.type]}</td>
                <td className={`p-3 text-right tabular-nums font-bold ${Number(m.qty) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {Number(m.qty) > 0 ? "+" : ""}{Number(m.qty)}
                </td>
                <td className="p-3 text-right tabular-nums">{Number(m.qty_after)}</td>
                <td className="p-3 text-xs text-muted-foreground">{m.notes ?? "—"}</td>
              </tr>
            ))}
            {(movs.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">Sem movimentações ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
