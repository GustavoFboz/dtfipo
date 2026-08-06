import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, ListChecks, Plus, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { confirm } from "@/lib/confirm";
import {
  fetchCaseChecklists, fetchChecklistTemplates, createCaseChecklist, toggleChecklistItem,
  deleteCaseChecklist, saveChecklistTemplate, addChecklistItem,
  type CaseChecklist,
} from "@/lib/checklists";

/** FAB + diálogos de checklist para o chat do caso. */
export function CaseChecklistFab({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const lists = useQuery({
    queryKey: ["case_checklists", caseId],
    queryFn: () => fetchCaseChecklists(caseId),
    staleTime: 15_000,
  });
  const templates = useQuery({
    queryKey: ["checklist_templates"],
    queryFn: fetchChecklistTemplates,
    staleTime: 60_000,
  });

  const data = lists.data ?? [];
  const current = useMemo(() => data.find((c) => c.id === openId) ?? null, [data, openId]);

  const create = useMutation({
    mutationFn: (p: { title: string; items: string[]; saveTemplate: boolean }) =>
      (async () => {
        const id = await createCaseChecklist(caseId, p.title, p.items);
        if (p.saveTemplate) await saveChecklistTemplate(p.title, p.items);
        return id;
      })(),
    onSuccess: (id) => {
      toast.success("Checklist criado");
      qc.invalidateQueries({ queryKey: ["case_checklists", caseId] });
      qc.invalidateQueries({ queryKey: ["checklist_templates"] });
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      setCreating(false);
      setOpenId(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (p: { item: CaseChecklist["items"][number]; title: string }) =>
      toggleChecklistItem(caseId, p.item, p.title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_checklists", caseId] });
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCaseChecklist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_checklists", caseId] });
      setOpenId(null);
    },
  });

  const addItem = useMutation({
    mutationFn: (p: { checklistId: string; label: string; position: number }) =>
      addChecklistItem(p.checklistId, p.label, p.position),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case_checklists", caseId] }),
  });

  const totalPending = data.reduce(
    (acc, c) => acc + c.items.filter((i) => !i.checked_at).length,
    0,
  );

  return (
    <>
      {/* FAB — canto inferior direito, acima do compositor */}
      <div className="absolute right-2 bottom-[104px] z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 grid place-items-center hover:scale-105 active:scale-95 transition"
              title="Checklists do caso"
            >
              <ListChecks className="h-5 w-5" />
              {totalPending > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-semibold text-white grid place-items-center">
                  {totalPending}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-64 rounded-2xl">
            <DropdownMenuLabel className="text-xs">Checklists</DropdownMenuLabel>
            {data.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum checklist neste caso.</div>
            )}
            {data.map((c) => {
              const done = c.items.filter((i) => i.checked_at).length;
              return (
                <DropdownMenuItem key={c.id} onClick={() => setOpenId(c.id)} className="text-sm">
                  <CheckCheck className="h-4 w-4 mr-2 opacity-60" />
                  <span className="truncate flex-1">{c.title}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground ml-2">
                    {done}/{c.items.length}
                  </span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCreating(true)} className="text-sm">
              <Plus className="h-4 w-4 mr-2" /> Novo checklist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NewChecklistDialog
        open={creating}
        onOpenChange={setCreating}
        templates={templates.data ?? []}
        onCreate={(title, items, saveTemplate) => create.mutate({ title, items, saveTemplate })}
        saving={create.isPending}
      />

      <Dialog open={!!current} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="sm:max-w-[460px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-light">{current?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              Qualquer pessoa da equipe pode marcar os itens. Cada marcação aparece no chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1 max-h-[50vh] overflow-y-auto">
            {current?.items.map((it) => (
              <label
                key={it.id}
                className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 cursor-pointer hover:bg-accent/50"
              >
                <Checkbox
                  checked={!!it.checked_at}
                  onCheckedChange={() => toggle.mutate({ item: it, title: current.title })}
                  className="mt-0.5"
                />
                <span className="flex-1 text-sm">
                  <span className={it.checked_at ? "line-through text-muted-foreground" : ""}>{it.label}</span>
                  {it.checked_at && (
                    <span className="block text-[11px] text-muted-foreground">
                      marcado em {new Date(it.checked_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {current && current.items.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">Checklist sem itens.</p>
            )}
          </div>
          <AddItemRow
            onAdd={(label) =>
              current && addItem.mutate({ checklistId: current.id, label, position: current.items.length })
            }
          />
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-xl text-red-500"
              onClick={async () => {
                if (!current) return;
                if (await confirm({ title: "Remover checklist", description: `Remover "${current.title}"?`, confirmText: "Remover", destructive: true })) {
                  remove.mutate(current.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Remover
            </Button>
            <Button className="rounded-xl" onClick={() => setOpenId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddItemRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) { onAdd(v.trim()); setV(""); }
        }}
        placeholder="Adicionar item…"
        className="rounded-xl h-9"
      />
      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl"
        disabled={!v.trim()}
        onClick={() => { onAdd(v.trim()); setV(""); }}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NewChecklistDialog({
  open, onOpenChange, templates, onCreate, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: { id: string; title: string; items: string[] }[];
  onCreate: (title: string, items: string[], saveTemplate: boolean) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [asTemplate, setAsTemplate] = useState(false);

  const applyTemplate = (t: { title: string; items: string[] }) => {
    setTitle(t.title);
    setItems(t.items.length ? [...t.items] : [""]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setTitle(""); setItems([""]); setAsTemplate(false); } }}>
      <DialogContent className="sm:max-w-[460px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">Novo checklist</DialogTitle>
          <DialogDescription className="text-xs">
            Use uma predefinição salva ou crie um checklist do zero.
          </DialogDescription>
        </DialogHeader>

        {templates.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Predefinições</Label>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="h-8 px-3 rounded-full border border-border text-xs hover:bg-accent"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" placeholder="Ex.: Conferência antes da fresagem" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Itens</Label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={it}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                  className="rounded-xl h-9"
                  placeholder={`Item ${i + 1}`}
                />
                <button
                  onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : [""])}
                  className="h-9 w-9 grid place-items-center rounded-xl border border-border hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setItems([...items, ""])}>
              <Plus className="h-4 w-4 mr-1.5" /> Adicionar item
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={asTemplate} onCheckedChange={(v) => setAsTemplate(!!v)} />
            Salvar como predefinição
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="rounded-xl"
            disabled={saving || !title.trim() || !items.some((i) => i.trim())}
            onClick={() => onCreate(title.trim(), items.map((i) => i.trim()).filter(Boolean), asTemplate)}
          >
            {saving ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
