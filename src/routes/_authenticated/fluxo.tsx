import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm } from "@/lib/confirm";
import { Plus, Trash2, ArrowUp, ArrowDown, GitBranch, Sparkles, Users, MessageSquareWarning, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  createStageSimple,
  deleteStage,
  fetchWorkflowSettings,
  fetchWorkflowStages,
  reorderStages,
  seedDefaultWorkflow,
  updateStage,
  fetchAllStageAssignments,
  setStageAssignees,
  fetchReturnReasons,
  createReturnReason,
  deleteReturnReason,
  type WorkflowStage,
} from "@/lib/workflow";
import { fetchProfile, fetchClinicTeamProfiles } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  REQUIREMENT_CATALOG,
  parseRequirements,
  type StageRequirement,
  type StageRequirementType,
} from "@/lib/stage-requirements";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/fluxo")({
  component: FluxoPage,
});

function FluxoPage() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const settings = useQuery({ queryKey: ["workflow_settings"], queryFn: fetchWorkflowSettings });
  const stages = useQuery({ queryKey: ["workflow_stages"], queryFn: fetchWorkflowStages });
  const team = useQuery({ queryKey: ["clinic_team"], queryFn: fetchClinicTeamProfiles });
  const stageAssigns = useQuery({ queryKey: ["stage_assignments_all"], queryFn: fetchAllStageAssignments });
  const reasons = useQuery({ queryKey: ["return_reasons"], queryFn: fetchReturnReasons });

  const isAdmin = profile.data?.role === "CEO" || profile.data?.role === "DR";
  const [newStage, setNewStage] = useState("");
  const [newReason, setNewReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workflow_stages"] });
    qc.invalidateQueries({ queryKey: ["stage_assignments_all"] });
    qc.invalidateQueries({ queryKey: ["return_reasons"] });
  };

  const seedMut = useMutation({
    mutationFn: seedDefaultWorkflow,
    onSuccess: () => { toast.success("Fluxo padrão aplicado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-12 max-w-3xl mx-auto">
        <h1 className="text-2xl font-light">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground mt-2">Apenas administradores podem gerenciar o fluxo.</p>
      </div>
    );
  }
  if (!settings.data?.phases_enabled) {
    return (
      <div className="p-12 max-w-3xl mx-auto">
        <h1 className="text-2xl font-light">Gestão de Fluxo desativada</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Ative em Configurações → Gestão de Fluxo para começar.
        </p>
      </div>
    );
  }

  async function handleCreateStage() {
    if (!newStage.trim()) return;
    const last = stages.data?.[stages.data.length - 1];
    const pos = ((last?.position ?? 0) + 10);
    try {
      await createStageSimple({ name: newStage.trim(), position: pos });
      setNewStage("");
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function move(id: string, dir: -1 | 1) {
    const list = stages.data ?? [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    const next = [...list];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    try {
      await reorderStages(next.map((x) => x.id));
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleAddReason() {
    if (!newReason.trim()) return;
    try {
      await createReturnReason(newReason.trim(), ((reasons.data?.[reasons.data.length - 1]?.position ?? 0) + 10));
      setNewReason("");
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleRemoveReason(id: string, label: string) {
    if (label.toLowerCase() === "ajuste") {
      toast.error("A justificativa padrão \"Ajuste\" não pode ser removida.");
      return;
    }
    if (!(await confirm({ title: "Remover justificativa", description: `Remover justificativa "${label}"?`, confirmText: "Remover", destructive: true }))) return;
    try { await deleteReturnReason(id); invalidate(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const list = stages.data ?? [];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10">
            <GitBranch className="h-5 w-5 text-primary stroke-[1.2px]" />
          </div>
          <div>
            <h1 className="text-2xl font-light tracking-tight">Gestão de Fluxo</h1>
            <p className="text-xs text-muted-foreground">Etapas lineares do caso e justificativas de retorno</p>
          </div>
        </div>
        <button
          onClick={async () => { if (await confirm({ title: "Restaurar fluxo padrão", description: "Restaurar fluxo padrão? As etapas atuais serão substituídas.", confirmText: "Restaurar", destructive: true })) seedMut.mutate(); }}
          disabled={seedMut.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-background hover:bg-accent disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> Aplicar fluxo padrão
        </button>
      </div>

      {/* Etapas */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70">Etapas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequência linear. O caso avança para a próxima ou volta para a anterior (com justificativa).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateStage()}
            placeholder="Nome da nova etapa…"
            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={handleCreateStage}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar etapa
          </button>
        </div>

        <div className="space-y-2">
          {list.map((s, i) => (
            <StageRow
              key={s.id}
              stage={s}
              index={i}
              total={list.length}
              onUp={() => move(s.id, -1)}
              onDown={() => move(s.id, 1)}
              onChange={invalidate}
              team={team.data ?? []}
              assignees={(stageAssigns.data ?? []).filter((a) => a.stage_id === s.id).map((a) => a.user_id)}
            />
          ))}
          {!list.length && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhuma etapa cadastrada. Use o botão acima ou aplique o fluxo padrão.
            </div>
          )}
        </div>
      </div>

      {/* Justificativas de retorno */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70">Justificativas de retorno</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Opções mostradas ao clicar em "Anterior" no caso. "Ajuste" envia direto para Desenho.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddReason()}
            placeholder="Nova justificativa…"
            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={handleAddReason}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border border-border bg-background hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(reasons.data ?? []).map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-border bg-background text-xs"
            >
              {r.label}
              <button
                onClick={() => handleRemoveReason(r.id, r.label)}
                className="text-muted-foreground hover:text-rose-500"
                aria-label="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageRow({
  stage, index, total, onUp, onDown, onChange, team, assignees,
}: {
  stage: WorkflowStage;
  index: number;
  total: number;
  onUp: () => void; onDown: () => void;
  onChange: () => void;
  team: Profile[];
  assignees: string[];
}) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color ?? "#94a3b8");

  async function save() {
    if (name === stage.name && color === stage.color) return;
    try { await updateStage(stage.id, { name, color }); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function remove() {
    if (!(await confirm({ title: "Excluir etapa", description: `Excluir a etapa "${stage.name}"?`, confirmText: "Excluir", destructive: true }))) return;
    try { await deleteStage(stage.id); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-muted-foreground w-6 text-center shrink-0">{index + 1}</span>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={save}
          className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer shrink-0"
          aria-label="Cor"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          className="flex-1 min-w-[180px] h-8 px-2 rounded-md border border-border bg-background text-sm font-medium"
        />
        <AssigneePicker
          team={team}
          value={assignees}
          onSave={async (ids) => { await setStageAssignees(stage.id, ids); onChange(); }}
        />
        <button onClick={onUp} disabled={index === 0} className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30" aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDown} disabled={index >= total - 1} className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30" aria-label="Descer">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={remove} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30" aria-label="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <StageRequirementsEditor stage={stage} onChange={onChange} />
    </div>
  );
}

function StageRequirementsEditor({
  stage,
  onChange,
}: {
  stage: WorkflowStage;
  onChange: () => void;
}) {
  const current = parseRequirements((stage as any).requirements);
  const availableTypes = (Object.keys(REQUIREMENT_CATALOG) as StageRequirementType[]).filter(
    (t) => !current.some((r) => r.type === t),
  );

  async function save(next: StageRequirement[]) {
    try {
      await updateStage(stage.id, { requirements: next as unknown } as any);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function add(type: StageRequirementType) {
    save([...current, { type, blocks_advance: true }]);
  }
  function remove(type: StageRequirementType) {
    save(current.filter((r) => r.type !== type));
  }
  function toggleBlocks(type: StageRequirementType, blocks: boolean) {
    save(current.map((r) => (r.type === type ? { ...r, blocks_advance: blocks } : r)));
  }

  return (
    <div className="pl-8 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-1.5">
          <ListChecks className="h-3 w-3" /> Exigir na etapa
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={availableTypes.length === 0}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> Adicionar exigência
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tipos disponíveis
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableTypes.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Todas as opções já foram adicionadas.
              </div>
            ) : (
              availableTypes.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => add(t)}
                  className="flex flex-col items-start gap-0.5 text-sm py-2"
                >
                  <span className="font-medium">{REQUIREMENT_CATALOG[t].label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {REQUIREMENT_CATALOG[t].description}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {current.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">
          Nenhuma exigência — a etapa avança livremente.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {current.map((r) => (
            <li
              key={r.type}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
            >
              <span className="flex-1 text-xs">{REQUIREMENT_CATALOG[r.type].label}</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-primary"
                  checked={r.blocks_advance}
                  onChange={(e) => toggleBlocks(r.type, e.target.checked)}
                />
                Impedir avanço
              </label>
              <button
                type="button"
                onClick={() => remove(r.type)}
                className="p-1 rounded text-muted-foreground hover:text-rose-500"
                aria-label="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssigneePicker({
  team, value, onSave,
}: {
  team: Profile[];
  value: string[];
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(value);
  useEffect(() => { setSelected(value); }, [value.join(",")]);
  const names = team.filter((t) => value.includes(t.id)).map((t) => t.full_name || t.email || "—");
  function toggle(id: string) {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }
  async function commit(next: boolean) {
    if (!next && selected.join(",") !== value.join(",")) {
      try { await onSave(selected); } catch (e) { toast.error((e as Error).message); }
    }
    setOpen(next);
  }
  return (
    <Popover open={open} onOpenChange={commit}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2 h-8 text-xs rounded-md border border-border bg-background hover:bg-accent"
        >
          <Users className="h-3 w-3" />
          {value.length === 0
            ? "Responsáveis"
            : <span className="truncate max-w-[180px]">{names.slice(0, 2).join(", ")}{names.length > 2 ? ` +${names.length - 2}` : ""}</span>
          }
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Responsáveis</div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {team.length === 0 && <div className="text-xs text-muted-foreground py-2 text-center">Nenhum membro</div>}
          {team.map((m) => {
            const checked = selected.includes(m.id);
            return (
              <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm">
                <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} />
                <span className="flex-1 truncate">{m.full_name || m.email}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{m.role}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
