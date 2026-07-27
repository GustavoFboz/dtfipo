// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/consumo-automatico")({
  component: ConsumoAutomaticoPage,
});

type Rule = {
  id: string;
  case_type_id: string | null;
  stage_id: string | null;
  stock_item_id: string;
  qty_per_case: number;
  qty_per_tooth: number;
  required: boolean;
  active: boolean;
  notes: string | null;
  mode: "auto" | "per_tooth_selection";
  applies_to: "any" | "implant_only";
};

function ConsumoAutomaticoPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const rules = useQuery({
    queryKey: ["stock_consumption_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_consumption_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const caseTypes = useQuery({
    queryKey: ["case_types_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_types")
        .select("id, name")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stages = useQuery({
    queryKey: ["stages_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stages")
        .select("id, name, position")
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["stock_items_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, name, qty_on_hand, unit")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_consumption_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      qc.invalidateQueries({ queryKey: ["stock_consumption_rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("stock_consumption_rules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock_consumption_rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const nameById = <T extends { id: string; name: string }>(arr: T[] | undefined, id: string | null) =>
    id ? arr?.find((x) => x.id === id)?.name ?? "—" : "Todos";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/5 grid place-items-center border border-primary/10">
            <Zap className="h-5 w-5 text-primary stroke-[1.2px]" />
          </div>
          <div>
            <h1 className="text-2xl font-light tracking-tight">Consumo automático</h1>
            <p className="text-xs text-muted-foreground">
              Vincule itens do estoque a tipos de caso e etapas. O débito ocorre ao avançar a etapa e é revertido ao retroceder.
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl">
          <Plus className="h-4 w-4 mr-1" /> Nova regra
        </Button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Tipo de caso</th>
              <th className="text-left px-4 py-3">Etapa</th>
              <th className="text-left px-4 py-3">Item</th>
              <th className="text-left px-4 py-3">Qtd/caso</th>
              <th className="text-left px-4 py-3">Qtd/dente</th>
              <th className="text-left px-4 py-3">Obrig.</th>
              <th className="text-left px-4 py-3">Ativa</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.data?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma regra cadastrada.</td></tr>
            )}
            {rules.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">{nameById(caseTypes.data as any, r.case_type_id)}</td>
                <td className="px-4 py-3">{nameById(stages.data as any, r.stage_id)}</td>
                <td className="px-4 py-3">{nameById(items.data as any, r.stock_item_id)}</td>
                <td className="px-4 py-3">{r.qty_per_case}</td>
                <td className="px-4 py-3">{r.qty_per_tooth}</td>
                <td className="px-4 py-3">{r.required ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">
                  <Switch checked={r.active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, active: v })} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: "Remover regra", description: "Remover regra?", confirmText: "Remover", destructive: true })) del.mutate(r.id); }}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RuleDialog
        open={open}
        onOpenChange={setOpen}
        rule={editing}
        caseTypes={(caseTypes.data ?? []) as any}
        stages={(stages.data ?? []) as any}
        items={(items.data ?? []) as any}
      />
    </div>
  );
}

function RuleDialog({
  open, onOpenChange, rule, caseTypes, stages, items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: Rule | null;
  caseTypes: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  items: { id: string; name: string; qty_on_hand: number; unit: string | null }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Rule>>({});

  // Reset form when opening
  const isEdit = !!rule;
  if (open && Object.keys(form).length === 0 && rule) {
    setForm(rule);
  }
  const reset = () => setForm({});

  const save = useMutation({
    mutationFn: async () => {
      if (!form.stock_item_id) throw new Error("Selecione um item do estoque");
      const payload = {
        case_type_id: form.case_type_id || null,
        stage_id: form.stage_id || null,
        stock_item_id: form.stock_item_id,
        qty_per_case: Number(form.qty_per_case ?? 0),
        qty_per_tooth: Number(form.qty_per_tooth ?? 0),
        required: !!form.required,
        active: form.active ?? true,
        notes: form.notes || null,
        mode: form.mode ?? "auto",
        applies_to: form.applies_to ?? "any",
      };
      if (isEdit && rule) {
        const { error } = await supabase.from("stock_consumption_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_consumption_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["stock_consumption_rules"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">{isEdit ? "Editar regra" : "Nova regra de consumo"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Quando o caso entra na etapa selecionada, o item será debitado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de caso (opcional)</Label>
            <Select value={form.case_type_id ?? "ALL"} onValueChange={(v) => setForm({ ...form, case_type_id: v === "ALL" ? null : v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os tipos</SelectItem>
                {caseTypes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Etapa-gatilho</Label>
            <Select value={form.stage_id ?? ""} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Item do estoque</Label>
            <Select value={form.stock_item_id ?? ""} onValueChange={(v) => setForm({ ...form, stock_item_id: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name} ({it.qty_on_hand} {it.unit ?? ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modo</Label>
              <Select value={form.mode ?? "auto"} onValueChange={(v) => setForm({ ...form, mode: v as any })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático ao avançar</SelectItem>
                  <SelectItem value="per_tooth_selection">Por dente selecionado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aplica-se a</Label>
              <Select value={form.applies_to ?? "any"} onValueChange={(v) => setForm({ ...form, applies_to: v as any })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Todos os dentes</SelectItem>
                  <SelectItem value="implant_only">Apenas dentes de implante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(form.mode ?? "auto") === "auto" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Qtd por caso</Label>
                <Input type="number" min={0} step="any" value={form.qty_per_case ?? 0}
                  onChange={(e) => setForm({ ...form, qty_per_case: Number(e.target.value) })}
                  className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Qtd por dente</Label>
                <Input type="number" min={0} step="any" value={form.qty_per_tooth ?? 0}
                  onChange={(e) => setForm({ ...form, qty_per_tooth: Number(e.target.value) })}
                  className="rounded-xl" />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
            <div>
              <div className="text-sm">Obrigatório</div>
              <div className="text-[11px] text-muted-foreground">
                {(form.mode ?? "auto") === "per_tooth_selection"
                  ? "Bloqueia o avanço até registrar o item em todos os dentes elegíveis."
                  : "Bloqueia o avanço se faltar estoque."}
              </div>
            </div>
            <Switch checked={!!form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
            <div>
              <div className="text-sm">Ativa</div>
              <div className="text-[11px] text-muted-foreground">Desligue para pausar sem apagar.</div>
            </div>
            <Switch checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} className="rounded-xl">Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl">
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
