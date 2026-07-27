import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Zap, X, AlertTriangle } from "lucide-react";
import type { CaseRow } from "@/lib/types";
import {
  fetchCaseImplantTeeth, fetchImplantStockItems, fetchImplantSystems,
  fetchImplantComponents, registerCaseImplantTooth, removeCaseImplantTooth,
  type CaseImplantTooth,
} from "@/lib/implants";
import { useStageRequirements } from "@/lib/stage-requirements";
import { optimisticAdjustStockItemQuantity, snapshotQueries, restoreQueries } from "@/lib/optimistic";

export function CaseImplantTeethPanel({ caseRow }: { caseRow: CaseRow }) {
  const qc = useQueryClient();
  const teeth = caseRow.implant_teeth ?? [];

  const usages = useQuery({
    queryKey: ["case_implant_teeth", caseRow.id],
    queryFn: () => fetchCaseImplantTeeth(caseRow.id),
    enabled: teeth.length > 0,
  });
  const systems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems, enabled: teeth.length > 0 });
  const components = useQuery({ queryKey: ["implant_components", "all"], queryFn: () => fetchImplantComponents(), enabled: teeth.length > 0 });
  const stockItems = useQuery({ queryKey: ["implant_stock_items"], queryFn: fetchImplantStockItems, enabled: teeth.length > 0 });

  const CHANNEL = `case-implants:${caseRow.id}`;
  useEffect(() => {
    if (teeth.length === 0) return;
    const ch = supabase
      .channel(CHANNEL, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => {
        qc.invalidateQueries({ queryKey: ["case_implant_teeth", caseRow.id] });
        qc.invalidateQueries({ queryKey: ["implant_stock_items"] });
        qc.invalidateQueries({ queryKey: ["stock_items_v2"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [CHANNEL, caseRow.id, qc, teeth.length]);

  const broadcast = async () => {
    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      ch.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
      setTimeout(resolve, 400);
    });
    await ch.send({ type: "broadcast", event: "changed", payload: { t: Date.now() } });
    setTimeout(() => supabase.removeChannel(ch), 800);
  };

  const register = useMutation({
    mutationFn: async ({ tooth, stockItemId }: { tooth: number; stockItemId: string }) =>
      registerCaseImplantTooth(caseRow.id, tooth, stockItemId),
    onMutate: async ({ tooth, stockItemId }) => {
      void qc.cancelQueries({ queryKey: ["case_implant_teeth", caseRow.id] });
      const usageSnap = snapshotQueries<CaseImplantTooth[]>(qc, ["case_implant_teeth", caseRow.id]);
      const stock = (stockItems.data ?? []).find((s) => s.id === stockItemId);
      const component = stock ? (components.data ?? []).find((c) => c.id === stock.implant_system_component_id) : null;
      const tempUsage: CaseImplantTooth = {
        id: `optimistic-${caseRow.id}-${tooth}-${stockItemId}`,
        case_id: caseRow.id,
        tooth_fdi: tooth,
        implant_system_id: component?.implant_system_id ?? "",
        stock_item_id: stockItemId,
        qty: 1,
        reversed_at: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseRow.id] }, (old) => {
        const list = Array.isArray(old) ? old.filter((u) => u.tooth_fdi !== tooth) : [];
        return [...list, tempUsage];
      });
      const stockOpt = optimisticAdjustStockItemQuantity(qc, stockItemId, -1, stock?.qty_on_hand);
      return { usageSnap, stockOpt, tempId: tempUsage.id };
    },
    onSuccess: (id, _vars, ctx) => {
      if (id && ctx?.tempId) {
        qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseRow.id] }, (old) =>
          Array.isArray(old) ? old.map((u) => (u.id === ctx.tempId ? { ...u, id } : u)) : old,
        );
      }
      qc.invalidateQueries({ queryKey: ["case_implant_teeth", caseRow.id], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["implant_stock_items"], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["stock_items_v2"], refetchType: "active" });
      void broadcast();
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.usageSnap) restoreQueries(qc, ctx.usageSnap);
      ctx?.stockOpt.rollback();
      toast.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: (usage: CaseImplantTooth) => removeCaseImplantTooth(usage.id),
    onMutate: async (usage) => {
      void qc.cancelQueries({ queryKey: ["case_implant_teeth", caseRow.id] });
      const usageSnap = snapshotQueries<CaseImplantTooth[]>(qc, ["case_implant_teeth", caseRow.id]);
      qc.setQueriesData<CaseImplantTooth[]>({ queryKey: ["case_implant_teeth", caseRow.id] }, (old) =>
        Array.isArray(old) ? old.filter((u) => u.id !== usage.id) : old,
      );
      const stock = (stockItems.data ?? []).find((s) => s.id === usage.stock_item_id);
      const stockOpt = optimisticAdjustStockItemQuantity(qc, usage.stock_item_id, Number(usage.qty || 1), stock?.qty_on_hand);
      return { usageSnap, stockOpt };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_implant_teeth", caseRow.id], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["implant_stock_items"], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["stock_items_v2"], refetchType: "active" });
      void broadcast();
    },
    onError: (e: Error, _usage, ctx) => {
      if (ctx?.usageSnap) restoreQueries(qc, ctx.usageSnap);
      ctx?.stockOpt.rollback();
      toast.error(e.message);
    },
  });

  const stageReqs = useStageRequirements(caseRow);
  if (teeth.length === 0) return null;

  const sortedTeeth = [...teeth].sort((a, b) => a - b);

  const currentStage = stageReqs.stage;
  const requires = stageReqs.hasImplantRequirement;
  const canEdit = stageReqs.canEditImplantComponents;
  const pending = sortedTeeth.filter(
    (t) => !(usages.data ?? []).some((u) => u.tooth_fdi === t),
  );
  const blocked = requires && pending.length > 0;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${blocked ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/70 bg-card"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Implantes por dente</h3>
        <span className="text-[10px] text-muted-foreground">
          Escolha o sistema/componente usado em cada dente — desconta do estoque automaticamente.
        </span>
      </div>
      {blocked ? (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Ação necessária para avançar a etapa "{currentStage?.name}"</div>
            <div>Aponte o componente para: <span className="font-mono">{pending.join(", ")}</span></div>
          </div>
        </div>
      ) : null}


      <div className="space-y-1.5">
        {sortedTeeth.map((tooth) => {
          const usage = (usages.data ?? []).find((u) => u.tooth_fdi === tooth);
          const chosenItem = usage ? (stockItems.data ?? []).find((s) => s.id === usage.stock_item_id) : null;
          const chosenComp = chosenItem ? (components.data ?? []).find((c) => c.id === chosenItem.implant_system_component_id) : null;
          const chosenSys = chosenComp ? (systems.data ?? []).find((s) => s.id === chosenComp.implant_system_id) : null;

          return (
            <div key={tooth} className="flex items-center gap-2 text-sm">
              <span className="font-mono font-semibold w-10 shrink-0">{tooth}</span>
              {usage ? (
                <>
                  <span className="flex-1 truncate">
                    {chosenSys ? <span className="text-primary font-medium">{chosenSys.name}</span> : null}
                    {chosenSys ? " — " : null}
                    {chosenItem?.name ?? "Item"}
                  </span>
                  {canEdit ? (
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => remove.mutate(usage)}
                      title="Remover para escolher outro componente"
                      className="h-7 px-2 text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">bloqueado</span>
                  )}
                </>
              ) : canEdit ? (
                <Select onValueChange={(v) => register.mutate({ tooth, stockItemId: v })}>
                  <SelectTrigger className="h-8 rounded-lg flex-1">
                    <SelectValue placeholder="Selecionar sistema/componente…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const tis = (caseRow.tooth_implant_systems ?? {}) as Record<string, string>;
                      const toothSysId = tis[String(tooth)];
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
                            {rows.map((r) => (
                              <SelectItem key={r.stock!.id} value={r.stock!.id} disabled={Number(r.stock!.qty_on_hand) < 1}>
                                {r.comp.name} — {Number(r.stock!.qty_on_hand)} {r.stock!.unit}
                              </SelectItem>
                            ))}
                          </div>
                        );
                      });
                    })()}
                  </SelectContent>

                </Select>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground italic">
                  Aguardando seleção do responsável pela etapa
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
