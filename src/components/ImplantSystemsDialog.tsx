import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { Plus, X, Trash2, Wrench, Package } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  fetchImplantSystems, fetchImplantComponents, fetchImplantStockItems,
  createImplantSystemWithStock, addComponentToSystem, deleteImplantSystem,
  renameImplantSystem, IMPLANT_BRAND_SUGGESTIONS,
} from "@/lib/implants";

export function ImplantSystemsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const systems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems, enabled: open });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["implant_systems"] });
    qc.invalidateQueries({ queryKey: ["implant_components"] });
    qc.invalidateQueries({ queryKey: ["implant_stock_items"] });
    qc.invalidateQueries({ queryKey: ["stock_items_v2"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Sistemas de Implantes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Cadastre marcas conhecidas ou digite qualquer nome (ex.: sistemas importados).
            </p>
            <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Novo sistema
            </Button>
          </div>

          {systems.data?.length === 0 && (
            <p className="text-sm text-muted-foreground italic p-6 text-center border border-dashed rounded-xl">
              Nenhum sistema cadastrado.
            </p>
          )}

          <div className="space-y-2">
            {(systems.data ?? []).map((s) => (
              <SystemRow
                key={s.id} system={s}
                expanded={editingId === s.id}
                onToggle={() => setEditingId((cur) => (cur === s.id ? null : s.id))}
                onChanged={invalidate}
              />
            ))}
          </div>
        </div>

        {creating && (
          <NewSystemDialog onClose={() => setCreating(false)} onCreated={invalidate} />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SystemRow({
  system, expanded, onToggle, onChanged,
}: { system: { id: string; name: string; line: string | null }; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [name, setName] = useState(system.name);
  const [line, setLine] = useState(system.line ?? "");
  const components = useQuery({
    queryKey: ["implant_components", system.id],
    queryFn: () => fetchImplantComponents(system.id),
    enabled: expanded,
  });
  const stockItems = useQuery({
    queryKey: ["implant_stock_items"],
    queryFn: fetchImplantStockItems,
    enabled: expanded,
  });

  const [newCompName, setNewCompName] = useState("");
  const [newCompQty, setNewCompQty] = useState("0");

  const rename = async () => {
    if (name === system.name && (line || "") === (system.line || "")) return;
    try { await renameImplantSystem(system.id, name.trim(), line.trim()); onChanged(); toast.success("Atualizado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Excluir sistema", description: `Excluir "${system.name}"? Componentes e itens de estoque vinculados perderão vínculo.`, confirmText: "Excluir", destructive: true }))) return;
    try { await deleteImplantSystem(system.id); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const addComp = async () => {
    if (!newCompName.trim()) return toast.error("Nome do componente é obrigatório");
    try {
      await addComponentToSystem(system.id, { name: newCompName.trim(), qty: Number(newCompQty) || 0 });
      setNewCompName(""); setNewCompQty("0"); onChanged();
      components.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="p-3 flex items-center gap-2 bg-muted/30">
        <button onClick={onToggle} className="text-left flex-1">
          <div className="font-medium text-sm">{system.name}</div>
          {system.line && <div className="text-xs text-muted-foreground">{system.line}</div>}
        </button>
        <button onClick={remove} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 border-t">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
            </div>
            <div>
              <Label className="text-xs">Linha (opcional)</Label>
              <Input value={line} onChange={(e) => setLine(e.target.value)} onBlur={rename} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Package className="h-3 w-3" /> Componentes deste sistema
            </div>
            <div className="space-y-1">
              {(components.data ?? []).map((c) => {
                const stock = (stockItems.data ?? []).find((s) => s.implant_system_component_id === c.id);
                return (
                  <div key={c.id} className="text-sm flex items-center justify-between px-2 py-1.5 rounded bg-muted/30">
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {stock ? `${Number(stock.qty_on_hand)} ${stock.unit}` : "sem estoque"}
                    </span>
                  </div>
                );
              })}
              {components.data?.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum componente cadastrado ainda.</p>
              )}
            </div>
            <div className="flex items-end gap-2 mt-2">
              <div className="flex-1">
                <Label className="text-xs">Novo componente</Label>
                <Input value={newCompName} onChange={(e) => setNewCompName(e.target.value)} placeholder="Ex.: Cone Morse 3.5x10" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Qtd</Label>
                <Input type="number" value={newCompQty} onChange={(e) => setNewCompQty(e.target.value)} />
              </div>
              <Button size="sm" onClick={addComp}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewSystemDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [components, setComponents] = useState<{ name: string; qty: string }[]>([{ name: "", qty: "0" }]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Nome do sistema é obrigatório");
    const comps = components.filter((c) => c.name.trim()).map((c) => ({
      name: c.name.trim(), qty: Number(c.qty) || 0,
    }));
    if (comps.length === 0) return toast.error("Adicione ao menos um componente com estoque");
    setSaving(true);
    try {
      await createImplantSystemWithStock({ name: name.trim(), line: line.trim(), components: comps });
      toast.success("Sistema criado");
      onCreated(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo sistema de implante</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do sistema</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} list="implant-brand-suggestions"
              placeholder="Ex.: Sin, Neodent, ou qualquer marca importada…" />
            <datalist id="implant-brand-suggestions">
              {IMPLANT_BRAND_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
            </datalist>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sugestões: {IMPLANT_BRAND_SUGGESTIONS.slice(0, 5).join(", ")}… Ou digite qualquer nome.
            </p>
          </div>
          <div>
            <Label className="text-xs">Linha / observação (opcional)</Label>
            <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Ex.: Cone Morse" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Componentes iniciais (com estoque)</Label>
              <Button size="sm" variant="outline" onClick={() => setComponents((c) => [...c, { name: "", qty: "0" }])}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {components.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input placeholder="Nome do componente (ex.: Cone Morse 3.5x10)" value={c.name}
                    onChange={(e) => setComponents((arr) => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                  <Input type="number" className="w-24" placeholder="Qtd" value={c.qty}
                    onChange={(e) => setComponents((arr) => arr.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} />
                  <button onClick={() => setComponents((arr) => arr.filter((_, idx) => idx !== i))}
                    className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Criar sistema"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
