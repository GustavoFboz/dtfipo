import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchImplantStockItems, fetchImplantSystems, fetchImplantComponents,
  fetchCaseImplantTeeth, registerCaseImplantTooth, removeCaseImplantTooth,
  type CaseImplantTooth,
} from "@/lib/implants";
import { useCanEditImplantComponents } from "@/hooks/use-can-edit-implant-components";
import { optimisticAdjustStockItemQuantity, snapshotQueries, restoreQueries } from "@/lib/optimistic";
import type { CaseRow } from "@/lib/types";

const NONE_VALUE = "__none__";

type Props = {
  caseRow: CaseRow;
  tooth: number | null;
  onClose: () => void;
};

export function PendingImplantToothPicker({ caseRow, tooth, onClose }: Props) {
  const caseId = caseRow.id;
  const qc = useQueryClient();
  const { canEdit } = useCanEditImplantComponents(caseRow);
  const open = tooth !== null && canEdit;

  useEffect(() => {
    if (tooth !== null && !canEdit) {
      toast.error("Somente o responsável pela etapa de componentes pode selecionar.");
      onClose();
    }
  }, [tooth, canEdit, onClose]);

  const systems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems, enabled: open });
  const components = useQuery({ queryKey: ["implant_components", "all"], queryFn: () => fetchImplantComponents(), enabled: open });
  const stockItems = useQuery({ queryKey: ["implant_stock_items"], queryFn: fetchImplantStockItems, enabled: open });
  const usages = useQuery({
    queryKey: ["case_implant_teeth", caseId],
    queryFn: () => fetchCaseImplantTeeth(caseId),
    enabled: open,
  });
  const currentUsage = tooth !== null ? (usages.data ?? []).find((u) => u.tooth_fdi === tooth) : undefined;

  const broadcast = async () => {
    const ch = supabase.channel(`case-implants:${caseId}`, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      ch.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
      setTimeout(resolve, 400);
    });
    await ch.send({ type: "broadcast", event: "changed", payload: { t: Date.now() } });
    setTimeout(() => supabase.removeChannel(ch), 800);
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["case_implant_teeth", caseId], refetchType: "active" });
    qc.invalidateQueries({ queryKey: ["implant_stock_items"], refetchType: "active" });
    qc.invalidateQueries({ queryKey: ["stock_items_v2"], refetchType: "active" });
  };

  const change = useMutation({
    mutationFn: async ({ t, stockItemId }: { t: number; stockItemId: string | null }) => {
      // Se já existe um componente, devolve ao estoque antes de escolher outro.
      if (currentUsage) await removeCaseImplantTooth(currentUsage.id);
      if (stockItemId) return registerCaseImplantTooth(caseId, t, stockItemId);
      return null;
    },
    onMutate: async ({ t, stockItemId }) => {
      void qc.cancelQueries({ queryKey: ["case_implant_teeth", caseId] });
      const usageSnap = snapshotQueries<CaseImplantTooth[]>(qc, ["case_implant_teeth", caseId]);
      const rollbacks: (() => void)[] = [];

      if (currentUsage) {
        const currentStock = (stockItems.data ?? []).find((s) => s.id === currentUsage.stock_item_id);
        rollbacks.push(
          optimisticAdjustStockItemQuantity(qc, currentUsage.stock_item_id, Number(currentUsage.qty || 1), currentStock?.qty_on_hand).rollback,
        );
      }

      let tempId: string | null = null;
      if (stockItemId) {
        const stock = (stockItems.data ?? []).find((s) => s.id === stockItemId);
        const component = stock ? (components.data ?? []).find((c) => c.id === stock.implant_system_component_id) : null;
        tempId = `optimistic-${caseId}-${t}-${stockItemId}`;
        const tempUsage: CaseImplantTooth = {
          id: tempId,
          case_id: caseId,
          tooth_fdi: t,
          implant_system_id: component?.implant_system_id ?? "",
          stock_item_id: stockItemId,
          qty: 1,
          reversed_at: null,
          created_at: new Date().toISOString(),
        };
        rollbacks.push(optimisticAdjustStockItemQuantity(qc, stockItemId, -1, stock?.qty_on_hand).rollback);
        qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseId] }, (old) => {
          const list = Array.isArray(old) ? old.filter((u) => u.tooth_fdi !== t) : [];
          return [...list, tempUsage];
        });
      } else {
        qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseId] }, (old) =>
          Array.isArray(old) ? old.filter((u) => u.tooth_fdi !== t) : old,
        );
      }

      return { usageSnap, rollbacks, tempId };
    },
    onSuccess: (id, vars, ctx) => {
      if (id && ctx?.tempId) {
        qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseId] }, (old) =>
          Array.isArray(old) ? old.map((u) => (u.id === ctx.tempId ? { ...u, id } : u)) : old,
        );
      }
      invalidateAll();
      void broadcast();
      toast.success(vars.stockItemId ? "Componente atualizado" : "Componente removido — dente pendente novamente");
      onClose();
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.usageSnap) restoreQueries(qc, ctx.usageSnap);
      ctx?.rollbacks.forEach((rollback) => rollback());
      toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Componente do implante · dente {tooth}</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <Select
            value={currentUsage?.stock_item_id ?? undefined}
            onValueChange={(v) => {
              if (tooth === null) return;
              if (v === NONE_VALUE) {
                if (!currentUsage) { onClose(); return; }
                change.mutate({ t: tooth, stockItemId: null });
              } else {
                if (currentUsage?.stock_item_id === v) { onClose(); return; }
                change.mutate({ t: tooth, stockItemId: v });
              }
            }}
          >
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Selecionar sistema/componente…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE} className="text-red-600 font-medium">
                Nenhum — exigir componente novamente
              </SelectItem>
              {(() => {
                const tis = (caseRow.tooth_implant_systems ?? {}) as Record<string, string>;
                const toothSysId = tooth !== null ? tis[String(tooth)] : undefined;
                const fallbackSysId = (caseRow as any).implant_system_id as string | undefined;
                const allowedSysId = toothSysId || fallbackSysId || null;
                const filteredSystems = allowedSysId
                  ? (systems.data ?? []).filter((s) => s.id === allowedSysId)
                  : (systems.data ?? []);
                return filteredSystems.map((sys) => {
                const sysComps = (components.data ?? []).filter((c) => c.implant_system_id === sys.id);
                const rows = sysComps
                  .map((c) => {
                    const stock = (stockItems.data ?? []).find((s) => s.implant_system_component_id === c.id);
                    return { comp: c, stock };
                  })
                  .filter((r) => r.stock);
                if (rows.length === 0) return null;
                return (
                  <div key={sys.id}>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50">
                      {sys.name}
                    </div>
                    {rows.map((r) => {
                      const isCurrent = currentUsage?.stock_item_id === r.stock!.id;
                      return (
                        <SelectItem
                          key={r.stock!.id}
                          value={r.stock!.id}
                          disabled={!isCurrent && Number(r.stock!.qty_on_hand) < 1}
                        >
                          {r.comp.name} — {Number(r.stock!.qty_on_hand)} {r.stock!.unit}
                          {isCurrent ? " · atual" : ""}
                        </SelectItem>
                      );
                    })}
                  </div>
                );
                });
              })()}

            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-2">
            {currentUsage
              ? "Ao trocar, o componente atual retorna ao estoque e o novo é descontado. Escolha \"Nenhum\" para liberar o dente e voltar a exigir o apontamento."
              : "Ao selecionar, o componente é descontado do estoque e o sinal vermelho do dente desaparece."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
