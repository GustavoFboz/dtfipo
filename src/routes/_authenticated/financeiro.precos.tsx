// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/precos")({
  component: PrecosPage,
});

type Unit = "tooth" | "plan" | "procedure" | "arch" | "case";
const UNIT_LABEL: Record<Unit, string> = {
  tooth: "Por dente",
  plan: "Por planejamento",
  procedure: "Por procedimento",
  arch: "Por arco",
  case: "Por caso",
};

type Rule = {
  id: string;
  name: string;
  unit: Unit;
  amount: number;
  case_type_id: string | null;
  procedure_key: string | null;
  active: boolean;
  clinic_id: string | null;
};

type CaseType = { id: string; name: string };

function PrecosPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Rule>>({ unit: "tooth", amount: 0, active: true });

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: ct }] = await Promise.all([
      supabase.from("production_pricing_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("case_types").select("id,name").order("name"),
    ]);
    setRules((r as Rule[]) ?? []);
    setCaseTypes((ct as CaseType[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name || !form.unit) { toast.error("Preencha nome e unidade"); return; }
    const payload = {
      name: form.name,
      unit: form.unit as Unit,
      amount: Number(form.amount ?? 0),
      case_type_id: form.case_type_id || null,
      procedure_key: form.procedure_key || null,
      active: form.active ?? true,
    };
    const { error } = await supabase.from("production_pricing_rules").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Regra criada");
    setForm({ unit: "tooth", amount: 0, active: true });
    load();
  }

  async function toggleActive(r: Rule) {
    const { error } = await supabase.from("production_pricing_rules").update({ active: !r.active }).eq("id", r.id);
    if (error) toast.error(error.message); else load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir regra?")) return;
    const { error } = await supabase.from("production_pricing_rules").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extralight tracking-tight">Preços de Produção</h1>
        <p className="text-sm text-slate-500 mt-1">
          Regras alimentam automaticamente o Calculation Engine para cada caso.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-light">Nova regra</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Zircônia por dente" />
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v as Unit })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                  <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Tipo de caso (opcional)</Label>
            <Select value={form.case_type_id ?? "all"} onValueChange={(v) => setForm({ ...form, case_type_id: v === "all" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {caseTypes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chave do procedimento (opcional)</Label>
            <Input value={form.procedure_key ?? ""} onChange={(e) => setForm({ ...form, procedure_key: e.target.value })} placeholder="Ex: cimentacao" />
          </div>
          <div className="flex items-end">
            <Button onClick={save} className="w-full">Adicionar regra</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-light mb-4">Regras cadastradas</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma regra ainda.</p>
        ) : (
          <div className="divide-y">
            {rules.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {UNIT_LABEL[r.unit]} · R$ {r.amount.toFixed(2)}
                    {r.case_type_id ? ` · ${caseTypes.find((c) => c.id === r.case_type_id)?.name ?? ""}` : ""}
                    {r.procedure_key ? ` · ${r.procedure_key}` : ""}
                  </div>
                </div>
                <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
