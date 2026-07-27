// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/participantes")({
  component: ParticipantesPage,
});

type Role = "cadista" | "dentista" | "planejador" | "protesista" | "auxiliar";
const ROLES: Role[] = ["cadista", "dentista", "planejador", "protesista", "auxiliar"];
const ROLE_LABEL: Record<Role, string> = {
  cadista: "Cadista",
  dentista: "Dentista",
  planejador: "Planejador",
  protesista: "Protesista",
  auxiliar: "Auxiliar",
};

type Profile = { id: string; full_name: string | null; email: string | null };
type Rule = {
  id: string; name: string; rule_type: "PERCENTAGE" | "FIXED" | "PER_TOOTH";
  percentage: number | null; percentage_base: string | null;
  fixed_amount: number | null; amount_per_tooth: number | null; is_active: boolean;
};

type Case = { id: string; case_label: string | null; case_number: number };
type Participant = {
  id: string; case_id: string; professional_id: string | null; role: string;
  percentage: number | null; fixed_amount: number | null; payment_rule_id: string | null;
};

function ParticipantesPage() {
  const [tab, setTab] = useState<"case" | "rules">("case");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extralight tracking-tight">Participantes e Regras</h1>
        <p className="text-sm text-slate-500 mt-1">
          Divida a produção de cada caso e cadastre regras reutilizáveis. Tudo alimenta o Calculation Engine.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant={tab === "case" ? "default" : "outline"} onClick={() => setTab("case")}>Por caso</Button>
        <Button variant={tab === "rules" ? "default" : "outline"} onClick={() => setTab("rules")}>Regras salvas</Button>
      </div>
      {tab === "case" ? <CasePanel /> : <RulesPanel />}
    </div>
  );
}

function CasePanel() {
  const [cases, setCases] = useState<Case[]>([]);
  const [caseId, setCaseId] = useState<string>("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [items, setItems] = useState<Participant[]>([]);
  const [form, setForm] = useState<Partial<Participant>>({ role: "cadista" });

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: r }] = await Promise.all([
        supabase.from("cases").select("id, case_label, case_number").order("case_number", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("financial_professional_rules").select("*").eq("is_active", true).order("name"),
      ]);
      setCases((c as Case[]) ?? []);
      setProfiles((p as Profile[]) ?? []);
      setRules((r as Rule[]) ?? []);
    })();
  }, []);

  async function loadItems(cid: string) {
    if (!cid) { setItems([]); return; }
    const { data } = await supabase.from("case_financial_participants").select("*").eq("case_id", cid).order("created_at");
    setItems((data as Participant[]) ?? []);
  }
  useEffect(() => { loadItems(caseId); }, [caseId]);

  async function add() {
    if (!caseId) { toast.error("Selecione um caso"); return; }
    if (!form.professional_id) { toast.error("Selecione o profissional"); return; }
    const payload = {
      case_id: caseId,
      professional_id: form.professional_id,
      role: form.role ?? "cadista",
      percentage: form.percentage != null && form.percentage !== 0 ? Number(form.percentage) : null,
      fixed_amount: form.fixed_amount != null && form.fixed_amount !== 0 ? Number(form.fixed_amount) : null,
      payment_rule_id: form.payment_rule_id || null,
    };
    const { error } = await supabase.from("case_financial_participants").insert(payload);
    if (error) { toast.error(error.message); return; }
    setForm({ role: "cadista" });
    loadItems(caseId);
    toast.success("Participante adicionado");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("case_financial_participants").delete().eq("id", id);
    if (error) toast.error(error.message); else loadItems(caseId);
  }

  const totalPct = useMemo(() => items.reduce((s, i) => s + Number(i.percentage ?? 0), 0), [items]);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <Label>Caso</Label>
        <Select value={caseId} onValueChange={setCaseId}>
          <SelectTrigger><SelectValue placeholder="Selecione um caso" /></SelectTrigger>
          <SelectContent>
            {cases.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                #{c.case_number} {c.case_label ? `— ${c.case_label}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {caseId && (
        <>
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-light">Adicionar participante</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={form.professional_id ?? ""} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Regra salva (opcional)</Label>
                <Select value={form.payment_rule_id ?? "none"} onValueChange={(v) => setForm({ ...form, payment_rule_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {rules.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Percentual (%)</Label>
                <Input type="number" step="0.01" value={form.percentage ?? ""} onChange={(e) => setForm({ ...form, percentage: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Valor fixo (R$)</Label>
                <Input type="number" step="0.01" value={form.fixed_amount ?? ""} onChange={(e) => setForm({ ...form, fixed_amount: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="flex items-end">
                <Button onClick={add} className="w-full">Adicionar</Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Preencha regra OU percentual OU valor fixo. Se preencher mais de um, a regra tem prioridade.
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-light">Participantes deste caso</h2>
              <span className="text-xs text-slate-500">Soma dos percentuais: {totalPct.toFixed(2)}%</span>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum participante ainda.</p>
            ) : (
              <div className="divide-y">
                {items.map((i) => {
                  const prof = profiles.find((p) => p.id === i.professional_id);
                  const rule = rules.find((r) => r.id === i.payment_rule_id);
                  return (
                    <div key={i.id} className="py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {ROLE_LABEL[i.role as Role] ?? i.role} · {prof?.full_name ?? prof?.email ?? "—"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {rule ? `Regra: ${rule.name}` : null}
                          {i.percentage ? ` · ${Number(i.percentage).toFixed(2)}%` : ""}
                          {i.fixed_amount ? ` · R$ ${Number(i.fixed_amount).toFixed(2)}` : ""}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(i.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function RulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState<Partial<Rule>>({ rule_type: "PERCENTAGE", is_active: true, percentage_base: "gross" });

  async function load() {
    const { data } = await supabase.from("financial_professional_rules").select("*").order("created_at", { ascending: false });
    setRules((data as Rule[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name || !form.rule_type) { toast.error("Preencha nome e tipo"); return; }
    const payload = {
      name: form.name,
      rule_type: form.rule_type,
      percentage: form.percentage ?? null,
      percentage_base: form.rule_type === "PERCENTAGE" ? (form.percentage_base ?? "gross") : null,
      fixed_amount: form.fixed_amount ?? null,
      amount_per_tooth: form.amount_per_tooth ?? null,
      is_active: form.is_active ?? true,
    };
    const { error } = await supabase.from("financial_professional_rules").insert(payload);
    if (error) { toast.error(error.message); return; }
    setForm({ rule_type: "PERCENTAGE", is_active: true, percentage_base: "gross" });
    toast.success("Regra criada"); load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir regra?")) return;
    const { error } = await supabase.from("financial_professional_rules").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-light">Nova regra</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Cadista 20% do bruto" />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.rule_type} onValueChange={(v) => setForm({ ...form, rule_type: v as Rule["rule_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE">Percentual</SelectItem>
                <SelectItem value="FIXED">Valor fixo</SelectItem>
                <SelectItem value="PER_TOOTH">Por dente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.rule_type === "PERCENTAGE" && (
            <>
              <div className="space-y-2">
                <Label>Percentual (%)</Label>
                <Input type="number" step="0.01" value={form.percentage ?? ""} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Base</Label>
                <Select value={form.percentage_base ?? "gross"} onValueChange={(v) => setForm({ ...form, percentage_base: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gross">Bruto</SelectItem>
                    <SelectItem value="net">Líquido</SelectItem>
                    <SelectItem value="received">Recebido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {form.rule_type === "FIXED" && (
            <div className="space-y-2">
              <Label>Valor fixo (R$)</Label>
              <Input type="number" step="0.01" value={form.fixed_amount ?? ""} onChange={(e) => setForm({ ...form, fixed_amount: Number(e.target.value) })} />
            </div>
          )}
          {form.rule_type === "PER_TOOTH" && (
            <div className="space-y-2">
              <Label>Valor por dente (R$)</Label>
              <Input type="number" step="0.01" value={form.amount_per_tooth ?? ""} onChange={(e) => setForm({ ...form, amount_per_tooth: Number(e.target.value) })} />
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={save} className="w-full">Criar regra</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-light mb-4">Regras cadastradas</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma regra ainda.</p>
        ) : (
          <div className="divide-y">
            {rules.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {r.rule_type === "PERCENTAGE" && `${Number(r.percentage ?? 0).toFixed(2)}% do ${r.percentage_base}`}
                    {r.rule_type === "FIXED" && `R$ ${Number(r.fixed_amount ?? 0).toFixed(2)} fixo`}
                    {r.rule_type === "PER_TOOTH" && `R$ ${Number(r.amount_per_tooth ?? 0).toFixed(2)} por dente`}
                    {r.is_active ? "" : " · inativa"}
                  </div>
                </div>
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
