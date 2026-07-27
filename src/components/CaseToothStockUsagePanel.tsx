// @ts-nocheck
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Package, X } from "lucide-react";
import type { CaseRow } from "@/lib/types";
import { optimisticAdjustStockItemQuantity, snapshotQueries, restoreQueries } from "@/lib/optimistic";

type Rule = {
  id: string;
  stage_id: string | null;
  case_type_id: string | null;
  stock_item_id: string;
  mode: "auto" | "per_tooth_selection";
  applies_to: "any" | "implant_only";
  required: boolean;
  active: boolean;
};
type Usage = {
  id: string;
  rule_id: string;
  stock_item_id: string;
  tooth_fdi: number;
  qty: number;
  reversed_at: string | null;
};
type StockItem = { id: string; name: string; qty_on_hand: number; unit: string | null; component_id: string | null };

export function CaseToothStockUsagePanel({ caseRow }: { caseRow: CaseRow }) {
  const qc = useQueryClient();
  const stageId = caseRow.current_stage_id ?? null;

  const rulesQ = useQuery({
    queryKey: ["tooth_rules", stageId],
    enabled: !!stageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_consumption_rules")
        .select("*")
        .eq("stage_id", stageId!)
        .eq("mode", "per_tooth_selection")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const caseTypeId = (caseRow as any).case_type_id as string | undefined;
  const rules = useMemo(
    () => (rulesQ.data ?? []).filter((r) => !r.case_type_id || r.case_type_id === caseTypeId),
    [rulesQ.data, caseTypeId],
  );

  const usagesQ = useQuery({
    queryKey: ["tooth_usages", caseRow.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_tooth_stock_usage")
        .select("id, rule_id, stock_item_id, tooth_fdi, qty, reversed_at")
        .eq("case_id", caseRow.id)
        .is("reversed_at", null);
      if (error) throw error;
      return (data ?? []) as Usage[];
    },
  });

  const itemIds = useMemo(() => Array.from(new Set(rules.map((r) => r.stock_item_id))), [rules]);
  const itemsQ = useQuery({
    queryKey: ["rule_items", itemIds.join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, name, qty_on_hand, unit, component_id")
        .in("id", itemIds);
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });

  // Itens elegíveis para troca = mesma categoria (component_id) do item base da regra
  const baseItems = itemsQ.data ?? [];
  const componentIds = Array.from(new Set(baseItems.map((i) => i.component_id).filter(Boolean) as string[]));
  const eligibleItemsQ = useQuery({
    queryKey: ["eligible_items", componentIds.join(",")],
    enabled: componentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, name, qty_on_hand, unit, component_id")
        .in("component_id", componentIds);
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });

  const TOOTH_USAGE_CHANNEL = `tooth-usage:${caseRow.id}`;

  useEffect(() => {
    const ch = supabase
      .channel(TOOTH_USAGE_CHANNEL, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => {
        qc.invalidateQueries({ queryKey: ["tooth_usages", caseRow.id] });
        qc.invalidateQueries({ queryKey: ["stock_items_all"] });
        qc.invalidateQueries({ queryKey: ["case", caseRow.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [TOOTH_USAGE_CHANNEL, caseRow.id, qc]);

  const broadcastChange = async () => {
    const ch = supabase.channel(TOOTH_USAGE_CHANNEL, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(() => resolve(), 500);
    });
    await ch.send({ type: "broadcast", event: "changed", payload: { case_id: caseRow.id, t: Date.now() } });
    setTimeout(() => supabase.removeChannel(ch), 1000);
  };

  const register = useMutation({
    mutationFn: async (p: { rule_id: string; tooth_fdi: number; stock_item_id: string }) => {
      const { data, error } = await supabase.rpc("register_tooth_stock_usage", {
        _case_id: caseRow.id,
        _rule_id: p.rule_id,
        _tooth_fdi: p.tooth_fdi,
        _stock_item_id: p.stock_item_id,
      });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Falha ao registrar");
    },
    onMutate: async (p) => {
      void qc.cancelQueries({ queryKey: ["tooth_usages", caseRow.id] });
      const usageSnap = snapshotQueries<Usage[]>(qc, ["tooth_usages", caseRow.id]);
      const stock = (eligibleItemsQ.data ?? []).find((i) => i.id === p.stock_item_id)
        ?? (itemsQ.data ?? []).find((i) => i.id === p.stock_item_id);
      const tempUsage: Usage = {
        id: `optimistic-${caseRow.id}-${p.rule_id}-${p.tooth_fdi}-${p.stock_item_id}`,
        rule_id: p.rule_id,
        stock_item_id: p.stock_item_id,
        tooth_fdi: p.tooth_fdi,
        qty: 1,
        reversed_at: null,
      };
      qc.setQueriesData<Usage[]>({ queryKey: ["tooth_usages", caseRow.id] }, (old) => {
        const list = Array.isArray(old) ? old.filter((u) => !(u.rule_id === p.rule_id && u.tooth_fdi === p.tooth_fdi)) : [];
        return [...list, tempUsage];
      });
      const stockOpt = optimisticAdjustStockItemQuantity(qc, p.stock_item_id, -1, stock?.qty_on_hand);
      return { usageSnap, stockOpt };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tooth_usages", caseRow.id], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["stock_items_all"], refetchType: "active" });
      void broadcastChange();
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.usageSnap) restoreQueries(qc, ctx.usageSnap);
      ctx?.stockOpt.rollback();
      toast.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (usage: Usage) => {
      const { data, error } = await supabase.rpc("remove_tooth_stock_usage", { _usage_id: usage.id });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Falha ao remover");
    },
    onMutate: async (usage) => {
      void qc.cancelQueries({ queryKey: ["tooth_usages", caseRow.id] });
      const usageSnap = snapshotQueries<Usage[]>(qc, ["tooth_usages", caseRow.id]);
      qc.setQueriesData<Usage[]>({ queryKey: ["tooth_usages", caseRow.id] }, (old) =>
        Array.isArray(old) ? old.filter((u) => u.id !== usage.id) : old,
      );
      const stock = (eligibleItemsQ.data ?? []).find((i) => i.id === usage.stock_item_id)
        ?? (itemsQ.data ?? []).find((i) => i.id === usage.stock_item_id);
      const stockOpt = optimisticAdjustStockItemQuantity(qc, usage.stock_item_id, Number(usage.qty || 1), stock?.qty_on_hand);
      return { usageSnap, stockOpt };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tooth_usages", caseRow.id], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["stock_items_all"], refetchType: "active" });
      void broadcastChange();
    },
    onError: (e: Error, _usage, ctx) => {
      if (ctx?.usageSnap) restoreQueries(qc, ctx.usageSnap);
      ctx?.stockOpt.rollback();
      toast.error(e.message);
    },
  });

  if (!stageId || rules.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Itens usados nesta etapa</h3>
      </div>
      {rules.map((rule) => {
        const baseItem = baseItems.find((i) => i.id === rule.stock_item_id);
        const eligibleTeeth: number[] = rule.applies_to === "implant_only"
          ? (caseRow.implant_teeth ?? [])
          : ((caseRow as any).teeth_numbers ?? caseRow.teeth_zirconia ?? []).concat(caseRow.teeth_dissilicato ?? []);
        const teeth = Array.from(new Set<number>(eligibleTeeth)).sort((a, b) => a - b);
        const eligibleItems = (eligibleItemsQ.data ?? []).filter(
          (i) => baseItem && i.component_id === baseItem.component_id,
        );
        const itemsList = eligibleItems.length > 0 ? eligibleItems : (baseItem ? [baseItem] : []);
        return (
          <div key={rule.id} className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Regra: <span className="font-medium text-foreground">{baseItem?.name ?? "—"}</span>
              {rule.required && <span className="ml-2 text-amber-600 font-semibold">obrigatório</span>}
              <span className="ml-2">({rule.applies_to === "implant_only" ? "implantes" : "todos os dentes"})</span>
            </div>
            {teeth.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Nenhum dente elegível neste caso.</div>
            ) : (
              <div className="space-y-1.5">
                {teeth.map((tooth) => {
                  const usage = (usagesQ.data ?? []).find((u) => u.rule_id === rule.id && u.tooth_fdi === tooth);
                  return (
                    <div key={tooth} className="flex items-center gap-2 text-sm">
                      <span className="font-mono font-semibold w-10 shrink-0">{tooth}</span>
                      {usage ? (
                        <>
                          <span className="flex-1 truncate text-foreground">
                            {itemsList.find((i) => i.id === usage.stock_item_id)?.name ?? "Item"}
                          </span>
                          <Button
                            type="button" size="sm" variant="ghost"
                            onClick={() => remove.mutate(usage)}
                            className="h-7 px-2 text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Select
                          onValueChange={(v) => register.mutate({ rule_id: rule.id, tooth_fdi: tooth, stock_item_id: v })}
                        >
                          <SelectTrigger className="h-8 rounded-lg flex-1">
                            <SelectValue placeholder="Selecionar item usado…" />
                          </SelectTrigger>
                          <SelectContent>
                            {itemsList.map((it) => (
                              <SelectItem key={it.id} value={it.id} disabled={it.qty_on_hand < 1}>
                                {it.name} — {it.qty_on_hand} {it.unit ?? ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
