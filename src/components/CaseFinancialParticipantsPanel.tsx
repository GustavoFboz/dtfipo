// @ts-nocheck
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Save, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Participant = Database["public"]["Tables"]["case_financial_participants"]["Row"];
type Insert = Database["public"]["Tables"]["case_financial_participants"]["Insert"];

const ROLE_OPTIONS = [
  "Cadista", "Planejador", "Protesista", "Dentista", "Cirurgião", "Auxiliar",
] as const;

const RULE_OPTIONS = [
  { value: "FIXED", label: "Valor fixo" },
  { value: "PER_TOOTH", label: "Por dente" },
  { value: "PER_CASE", label: "Por caso" },
  { value: "PERCENTAGE", label: "Percentual" },
  { value: "HYBRID", label: "Híbrido" },
  { value: "CUSTOM", label: "Personalizado" },
] as const;

type Draft = {
  professional_id: string | null;
  role: string;
  rule_type: string;
  percentage: string;
  fixed_amount: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  professional_id: null,
  role: ROLE_OPTIONS[0],
  rule_type: "FIXED",
  percentage: "",
  fixed_amount: "",
  notes: "",
};

function parseNumber(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}

export function CaseFinancialParticipantsPanel({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["case-financial-participants", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_financial_participants")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Participant[];
    },
  });

  const professionalIds = useMemo(
    () => Array.from(new Set(participants.map((p) => p.professional_id).filter(Boolean) as string[])),
    [participants],
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ["case-financial-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  const addMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const { data: me, error: meErr } = await supabase.auth.getUser();
      if (meErr || !me.user) throw new Error("Sessão expirada");
      const { data: prof, error: pErr } = await supabase
        .from("profiles").select("clinic_id").eq("id", me.user.id).maybeSingle();
      if (pErr) throw pErr;
      if (!prof?.clinic_id) throw new Error("Empresa não definida para o usuário");
      const payload: Insert = {
        case_id: caseId,
        clinic_id: prof.clinic_id,
        professional_id: d.professional_id,
        role: d.role.trim() || "Colaborador",
        percentage: parseNumber(d.percentage),
        fixed_amount: parseNumber(d.fixed_amount),
        notes: d.notes.trim() || null,
        metadata: { rule_type: d.rule_type },
      };
      const { error } = await supabase.from("case_financial_participants").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Participante adicionado");
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["case-financial-participants", caseId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao adicionar"),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_financial_participants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Participante removido");
      qc.invalidateQueries({ queryKey: ["case-financial-participants", caseId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Participantes Financeiros</h3>
          <p className="text-xs text-muted-foreground">
            Profissionais envolvidos e suas regras de remuneração para este caso.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Usuário</label>
              <Select
                value={draft.professional_id ?? "__none"}
                onValueChange={(v) => setDraft((d) => ({ ...d, professional_id: v === "__none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem usuário vinculado</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Função</label>
              <Select value={draft.role} onValueChange={(v) => setDraft((d) => ({ ...d, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Regra financeira</label>
              <Select value={draft.rule_type} onValueChange={(v) => setDraft((d) => ({ ...d, rule_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">Percentual (%)</label>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={draft.percentage}
                  onChange={(e) => setDraft((d) => ({ ...d, percentage: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">Valor fixo</label>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={draft.fixed_amount}
                  onChange={(e) => setDraft((d) => ({ ...d, fixed_amount: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">Observações</label>
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Notas opcionais"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setDraft(EMPTY_DRAFT); }}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => addMutation.mutate(draft)} disabled={addMutation.isPending}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : participants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            Nenhum participante financeiro cadastrado para este caso.
          </div>
        ) : (
          participants.map((p) => {
            const rule = RULE_OPTIONS.find((r) => r.value === ((p.metadata as any)?.rule_type ?? ""));
            return (
              <div key={p.id} className="rounded-xl border border-border/70 bg-card p-3 flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-[hsl(212_95%_94%)] text-[hsl(212_85%_35%)] grid place-items-center shrink-0">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{nameOf(p.professional_id)}</span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px]">
                      {p.role}
                    </span>
                    {rule && (
                      <span className="inline-flex items-center rounded-full bg-[hsl(212_95%_94%)] text-[hsl(212_85%_35%)] px-2 py-0.5 text-[11px]">
                        {rule.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                    {p.percentage != null && <span>Percentual: <b>{p.percentage}%</b></span>}
                    {p.fixed_amount != null && <span>Valor fixo: <b>R$ {Number(p.fixed_amount).toFixed(2)}</b></span>}
                  </div>
                  {p.notes && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{p.notes}</div>}
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(p.id)}
                  disabled={removeMutation.isPending}
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CaseFinancialParticipantsPanel;