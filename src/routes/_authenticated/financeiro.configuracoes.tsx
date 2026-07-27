import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  useProfessionalRules,
  useCreateProfessionalRule,
  useUpdateProfessionalRule,
  useDeleteProfessionalRule,
} from "@/lib/financial/professional-rules/hooks";
import type {
  FinancialProfessionalRule,
  ProfessionalRuleType,
  PercentageBase,
} from "@/lib/financial/professional-rules/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Save,
  Lock,
  BadgePercent,
  Coins,
  Layers,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/configuracoes")({
  component: RulesAdminPage,
});

const RULE_TYPES: {
  value: ProfessionalRuleType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "FIXED", label: "Valor fixo", hint: "Um valor fechado por período", icon: Coins },
  { value: "PER_CASE", label: "Por caso", hint: "Valor multiplicado pelo número de casos", icon: Layers },
  { value: "PER_TOOTH", label: "Por dente", hint: "Valor multiplicado pela quantidade de dentes", icon: Sparkles },
  { value: "PERCENTAGE", label: "Porcentagem", hint: "Percentual sobre uma base (recebido, bruto, líquido)", icon: BadgePercent },
  { value: "HYBRID", label: "Híbrido", hint: "Combina fixo + variável + %", icon: Layers },
];

type Draft = Partial<FinancialProfessionalRule> & { rule_type: ProfessionalRuleType };

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  rule_type: "FIXED",
  fixed_amount: null,
  amount_per_case: null,
  amount_per_tooth: null,
  percentage: null,
  percentage_base: "received" as PercentageBase,
  components: [],
  parameters: {},
  applies_to_filters: {},
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null,
  is_active: true,
  priority: 0,
  currency: "BRL",
  metadata: {},
});

function RulesAdminPage() {
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  if (adminLoading) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 font-light">Carregando…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 p-10 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4">
        <div className="p-4 rounded-2xl bg-primary/5 text-primary border border-primary/10">
          <Lock className="h-5 w-5 stroke-[1.4px]" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70 mb-2">
            Acesso restrito
          </div>
          <div className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
            Apenas administradores
          </div>
          <p className="text-sm font-light text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">
            Esta área é reservada para configuração de regras financeiras.
          </p>
        </div>
      </div>
    );
  }

  return <RulesAdminInner />;
}

function RulesAdminInner() {
  const { data: rules = [], isLoading } = useProfessionalRules();
  const createMut = useCreateProfessionalRule();
  const updateMut = useUpdateProfessionalRule();
  const deleteMut = useDeleteProfessionalRule();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const isNew = selectedId === null;

  const { data: professionals = [] } = useQuery({
    queryKey: ["profiles", "professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const professionalById = useMemo(() => {
    const m = new Map<string, string>();
    professionals.forEach((p) => m.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
    return m;
  }, [professionals]);

  function selectRule(r: FinancialProfessionalRule) {
    setSelectedId(r.id);
    setDraft({ ...r });
  }

  function startNew() {
    setSelectedId(null);
    setDraft(emptyDraft());
  }

  async function save() {
    if (!draft.name?.trim()) return toast.error("Dê um nome à regra");
    if (!draft.user_id) return toast.error("Selecione o profissional");
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(draft as Partial<FinancialProfessionalRule>);
        toast.success("Regra criada");
        selectRule(created);
      } else if (selectedId) {
        const updated = await updateMut.mutateAsync({ id: selectedId, patch: draft });
        toast.success("Regra atualizada");
        selectRule(updated);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function remove() {
    if (!selectedId) return;
    if (!confirm("Excluir esta regra?")) return;
    try {
      await deleteMut.mutateAsync(selectedId);
      toast.success("Regra removida");
      startNew();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <SettingsIcon className="h-3 w-3" />
          Administração
        </div>
        <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
          Regras financeiras
        </h1>
        <p className="text-sm md:text-base font-light text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
          Configure valores fixos, por caso, por dente, percentuais ou combinações híbridas para cada profissional.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5">
        {/* List */}
        <aside className="space-y-3">
          <button
            onClick={startNew}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Nova regra
          </button>

          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 p-3 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-xs text-slate-400">Carregando…</div>
            ) : rules.length === 0 ? (
              <div className="p-4 text-xs font-light text-slate-500 dark:text-slate-400">
                Nenhuma regra cadastrada ainda.
              </div>
            ) : (
              <ul className="space-y-1">
                {rules.map((r) => {
                  const active = selectedId === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => selectRule(r)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                          active
                            ? "bg-primary/5 border-primary/15"
                            : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-primary/70">
                            {r.rule_type}
                          </span>
                          {!r.is_active && (
                            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                              inativa
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-900 dark:text-slate-100 truncate">{r.name}</div>
                        <div className="text-[11px] font-light text-slate-500 dark:text-slate-400 truncate">
                          {professionalById.get(r.user_id) ?? "—"}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70 mb-1">
                {isNew ? "Nova regra" : "Editando regra"}
              </div>
              <div className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
                {draft.name || "Sem nome"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isNew && (
                <button
                  onClick={remove}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-sm hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
              <button
                onClick={save}
                disabled={createMut.isPending || updateMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-60 transition"
              >
                <Save className="h-4 w-4" /> Salvar
              </button>
            </div>
          </div>

          {/* Basic */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Nome
              </Label>
              <Input
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex.: Comissão do Dr. Silva"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <UserIcon className="inline h-3 w-3 mr-1" /> Profissional
              </Label>
              <Select
                value={draft.user_id ?? ""}
                onValueChange={(v) => setDraft({ ...draft, user_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rule type cards */}
          <div className="space-y-3">
            <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Tipo de regra
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {RULE_TYPES.map((rt) => {
                const active = draft.rule_type === rt.value;
                const Icon = rt.icon;
                return (
                  <button
                    key={rt.value}
                    onClick={() => setDraft({ ...draft, rule_type: rt.value })}
                    className={`text-left p-3 rounded-2xl border transition ${
                      active
                        ? "bg-primary/5 border-primary/20 text-slate-900 dark:text-slate-100"
                        : "border-slate-100 dark:border-slate-800 hover:border-primary/20"
                    }`}
                  >
                    <Icon className={`h-4 w-4 stroke-[1.4px] mb-2 ${active ? "text-primary" : "text-slate-400"}`} />
                    <div className="text-xs font-medium">{rt.label}</div>
                    <div className="text-[10px] font-light text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                      {rt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type-specific fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(draft.rule_type === "FIXED" || draft.rule_type === "HYBRID") && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  Valor fixo (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.fixed_amount ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, fixed_amount: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="Ex.: 2000"
                />
              </div>
            )}
            {(draft.rule_type === "PER_CASE" || draft.rule_type === "HYBRID") && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  Por caso (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.amount_per_case ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, amount_per_case: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="Ex.: 100"
                />
              </div>
            )}
            {(draft.rule_type === "PER_TOOTH" || draft.rule_type === "HYBRID") && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  Por dente (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.amount_per_tooth ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, amount_per_tooth: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="Ex.: 25"
                />
              </div>
            )}
            {(draft.rule_type === "PERCENTAGE" || draft.rule_type === "HYBRID") && (
              <>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Percentual (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.percentage ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, percentage: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Ex.: 30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Base do percentual
                  </Label>
                  <Select
                    value={(draft.percentage_base as string) ?? "received"}
                    onValueChange={(v) => setDraft({ ...draft, percentage_base: v as PercentageBase })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="received">Valor recebido</SelectItem>
                      <SelectItem value="gross">Valor bruto</SelectItem>
                      <SelectItem value="net">Valor líquido</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {/* Vigência */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Início
              </Label>
              <Input
                type="date"
                value={draft.start_date ?? ""}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Fim (opcional)
              </Label>
              <Input
                type="date"
                value={draft.end_date ?? ""}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Prioridade
              </Label>
              <Input
                type="number"
                value={draft.priority ?? 0}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Descrição
            </Label>
            <Input
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Notas internas sobre a regra"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Regra ativa</div>
              <div className="text-xs font-light text-slate-500 dark:text-slate-400">
                Somente regras ativas entram nos cálculos futuros.
              </div>
            </div>
            <Switch
              checked={draft.is_active ?? true}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
