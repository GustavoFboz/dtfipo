import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm, promptDialog } from "@/lib/confirm";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, Wrench, Layers, Package, Tag, Edit2, X, ChevronDown, ChevronRight, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  fetchImplantSystems, fetchImplantComponents, fetchImplantStockItems,
  fetchImplantComponentTypes, createImplantComponentType,
  updateImplantComponentType, deleteImplantComponentType,
  createImplantSystemWithStock, addImplantComponent,
  deleteImplantSystem, renameImplantSystem,
  IMPLANT_BRAND_SUGGESTIONS,
  type ImplantComponentType, type ImplantSystem,
} from "@/lib/implants";
import { adjustStockV2 } from "@/lib/stock-v2";

export const Route = createFileRoute("/_authenticated/configuracoes/implantes")({
  component: ImplantesModulePage,
});

function ImplantesModulePage() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/configuracoes"
          className="h-9 w-9 rounded-xl border border-border grid place-items-center hover:bg-accent/50"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="h-11 w-11 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10">
          <Wrench className="h-5 w-5 text-primary stroke-[1.2px]" />
        </div>
        <div>
          <h1 className="text-2xl font-light tracking-tight">Módulo de Implantes</h1>
          <p className="text-xs text-muted-foreground">Sistemas, tipos de componente e estoque dedicado</p>
        </div>
      </div>

      <Tabs defaultValue="systems" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="systems" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Sistemas</TabsTrigger>
          <TabsTrigger value="types" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Tipos</TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Estoque</TabsTrigger>
        </TabsList>

        <TabsContent value="systems" className="mt-4"><SystemsTab /></TabsContent>
        <TabsContent value="types" className="mt-4"><ComponentTypesTab /></TabsContent>
        <TabsContent value="stock" className="mt-4"><ImplantStockTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------- Sistemas ----------------- */

function SystemsTab() {
  const qc = useQueryClient();
  const systems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems });
  const types = useQuery({ queryKey: ["implant_component_types"], queryFn: fetchImplantComponentTypes });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["implant_systems"] });
    qc.invalidateQueries({ queryKey: ["implant_components"] });
    qc.invalidateQueries({ queryKey: ["implant_stock_items"] });
    qc.invalidateQueries({ queryKey: ["stock_items_v2"] });
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Cadastre marcas/linhas. Ao criar, a categoria "Implantes" no estoque é ativada automaticamente.
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
            key={s.id}
            system={s}
            types={types.data ?? []}
            expanded={openId === s.id}
            onToggle={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
            onChanged={invalidate}
          />
        ))}
      </div>

      {creating && (
        <NewSystemDialog
          types={types.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={invalidate}
        />
      )}
    </div>
  );
}

function SystemRow({
  system, types, expanded, onToggle, onChanged,
}: {
  system: ImplantSystem;
  types: ImplantComponentType[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
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
  const [adding, setAdding] = useState(false);

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

  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? "Outros";
  const isTiBaseType = (id: string | null) => {
    const n = typeName(id).toLowerCase();
    return n.includes("t-base") || n.includes("ti base") || n.includes("tibase") || n.includes("ti-base");
  };

  const { tiBases, others } = useMemo(() => {
    const tb: any[] = [];
    const oMap = new Map<string, any[]>();
    for (const c of (components.data ?? [])) {
      if (isTiBaseType(c.component_type_id)) {
        tb.push(c);
      } else {
        const key = typeName(c.component_type_id);
        if (!oMap.has(key)) oMap.set(key, []);
        oMap.get(key)!.push(c);
      }
    }
    return {
      tiBases: tb,
      others: Array.from(oMap.entries())
        .map(([type, items]) => ({ type, items }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    };
  }, [components.data, types]);

  const renderStockLabel = (compId: string) => {
    const stock = (stockItems.data ?? []).find((s) => s.implant_system_component_id === compId);
    return stock ? `${Number(stock.qty_on_hand)} ${stock.unit}` : "sem estoque";
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="p-3 flex items-center gap-2 bg-muted/30">
        <button onClick={onToggle} className="text-left flex-1 flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <div className="font-medium text-sm">{system.name}</div>
            {system.line && <div className="text-xs text-muted-foreground">{system.line}</div>}
          </div>
        </button>
        <Button size="sm" variant="outline" onClick={onToggle} className="gap-1.5 h-8">
          <Package className="h-3.5 w-3.5" />
          Componentes
        </Button>
        <button onClick={remove} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30" aria-label="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-4 border-t">
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

          <div className="flex items-center justify-end">
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1 h-7">
              <Plus className="h-3 w-3" /> Componente
            </Button>
          </div>

          {/* T-Bases (destacados — vinculados por dente no fluxo) */}
          <section className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Anchor className="h-3.5 w-3.5 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">T-Bases</h4>
              <span className="text-[10px] text-muted-foreground ml-1">
                Cada T-Base pode ser atribuído a um dente do caso.
              </span>
            </div>
            {tiBases.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum T-Base cadastrado para este sistema.</p>
            ) : (
              <div className="space-y-1">
                {tiBases.map((c: any) => (
                  <div key={c.id} className="text-sm flex items-center justify-between px-2 py-1.5 rounded bg-background border border-border/60">
                    <span>{c.name}{c.sku && <span className="text-muted-foreground text-xs ml-2">({c.sku})</span>}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{renderStockLabel(c.id)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Demais categorias (Análogo, Link, UCLA, …) */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outras categorias</h4>
            </div>
            {others.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum componente em outras categorias.</p>
            ) : (
              <div className="space-y-3">
                {others.map((g) => (
                  <div key={g.type}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1">{g.type}</div>
                    <div className="space-y-1">
                      {g.items.map((c: any) => (
                        <div key={c.id} className="text-sm flex items-center justify-between px-2 py-1.5 rounded bg-muted/30">
                          <span>{c.name}{c.sku && <span className="text-muted-foreground text-xs ml-2">({c.sku})</span>}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{renderStockLabel(c.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {adding && (
            <AddComponentDialog
              systemId={system.id}
              types={types}
              onClose={() => setAdding(false)}
              onCreated={() => { onChanged(); components.refetch(); stockItems.refetch(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NewSystemDialog({
  types, onClose, onCreated,
}: { types: ImplantComponentType[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const defaultTypeId = types.find((t) => t.name === "Outros")?.id ?? types[0]?.id ?? "";
  const [components, setComponents] = useState<{ name: string; qty: string; component_type_id: string }[]>([
    { name: "", qty: "0", component_type_id: defaultTypeId },
  ]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Nome do sistema é obrigatório");
    const comps = components.filter((c) => c.name.trim()).map((c) => ({
      name: c.name.trim(),
      qty: Number(c.qty) || 0,
      component_type_id: c.component_type_id || null,
    }));
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
              placeholder="Ex.: Sin, Neodent, Straumann…" />
            <datalist id="implant-brand-suggestions">
              {IMPLANT_BRAND_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <Label className="text-xs">Linha / observação (opcional)</Label>
            <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Ex.: Cone Morse" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Componentes iniciais</Label>
              <Button size="sm" variant="outline" onClick={() => setComponents((c) => [...c, { name: "", qty: "0", component_type_id: defaultTypeId }])}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {components.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_80px_28px] gap-2 items-center">
                  <Input placeholder="Nome (ex.: T-Base 3.5×10)" value={c.name}
                    onChange={(e) => setComponents((arr) => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                  <Select value={c.component_type_id}
                    onValueChange={(v) => setComponents((arr) => arr.map((x, idx) => idx === i ? { ...x, component_type_id: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qtd" value={c.qty}
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

function AddComponentDialog({
  systemId, types, onClose, onCreated,
}: { systemId: string; types: ImplantComponentType[]; onClose: () => void; onCreated: () => void }) {
  const defaultTypeId = types.find((t) => t.name === "Outros")?.id ?? types[0]?.id ?? "";
  const [typeId, setTypeId] = useState(defaultTypeId);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("0");
  const [min, setMin] = useState("0");
  const [unit, setUnit] = useState("un");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    try {
      await addImplantComponent({
        system_id: systemId,
        type_id: typeId || null,
        name: name.trim(),
        sku: sku.trim() || undefined,
        qty: Number(qty) || 0,
        min_qty: Number(min) || 0,
        unit,
      });
      toast.success("Componente adicionado");
      onCreated(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo componente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: T-Base 3.5×10" />
          </div>
          <div>
            <Label className="text-xs">SKU (opcional)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Qtd inicial</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Mín.</Label>
              <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Un.</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Adicionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- Tipos de componente ----------------- */

function ComponentTypesTab() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ["implant_component_types"], queryFn: fetchImplantComponentTypes });
  const [newName, setNewName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["implant_component_types"] });

  const create = useMutation({
    mutationFn: () => createImplantComponentType(newName, 100),
    onSuccess: () => { toast.success("Tipo criado"); setNewName(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <p className="text-xs text-muted-foreground">
        Tipos de componente disponíveis ao cadastrar itens (Análogo, T-Base, Link, UCLA…).
      </p>

      <div className="flex gap-2">
        <Input placeholder="Novo tipo (ex.: Mini-pilar)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button onClick={() => newName.trim() && create.mutate()} disabled={create.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>

      <div className="space-y-1.5">
        {(types.data ?? []).map((t) => (
          <TypeRow key={t.id} type={t} onChanged={invalidate} />
        ))}
      </div>
    </div>
  );
}

function TypeRow({ type, onChanged }: { type: ImplantComponentType; onChanged: () => void }) {
  const [name, setName] = useState(type.name);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    if (name.trim() === type.name) return setEditing(false);
    try { await updateImplantComponentType(type.id, { name: name.trim() }); onChanged(); setEditing(false); }
    catch (e) { toast.error((e as Error).message); }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Excluir tipo", description: `Excluir tipo "${type.name}"? Componentes existentes ficarão sem tipo.`, confirmText: "Excluir", destructive: true }))) return;
    try { await deleteImplantComponentType(type.id); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/20">
      {editing ? (
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()} autoFocus className="h-8" />
      ) : (
        <span className="flex-1 text-sm">{type.name}</span>
      )}
      <button onClick={() => setEditing((v) => !v)} className="p-1.5 rounded hover:bg-accent">
        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button onClick={remove} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ----------------- Estoque de componentes ----------------- */

function ImplantStockTab() {
  const qc = useQueryClient();
  const systems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems });
  const types = useQuery({ queryKey: ["implant_component_types"], queryFn: fetchImplantComponentTypes });
  const components = useQuery({ queryKey: ["implant_components"], queryFn: () => fetchImplantComponents() });
  const stock = useQuery({ queryKey: ["implant_stock_items"], queryFn: fetchImplantStockItems });

  const [filterSystem, setFilterSystem] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const grouped = useMemo(() => {
    const comps = components.data ?? [];
    const sysMap = new Map((systems.data ?? []).map((s) => [s.id, s.name]));
    const typeMap = new Map((types.data ?? []).map((t) => [t.id, t.name]));
    const stockMap = new Map((stock.data ?? []).map((s) => [s.implant_system_component_id!, s]));

    const filtered = comps.filter((c) => {
      if (filterSystem !== "all" && c.implant_system_id !== filterSystem) return false;
      if (filterType !== "all" && c.component_type_id !== filterType) return false;
      return true;
    });

    const bySystem = new Map<string, Map<string, { type: string; items: any[] }>>();
    for (const c of filtered) {
      const sysName = sysMap.get(c.implant_system_id) ?? "—";
      const typeName = c.component_type_id ? (typeMap.get(c.component_type_id) ?? "Outros") : "Outros";
      if (!bySystem.has(sysName)) bySystem.set(sysName, new Map());
      const typeGroup = bySystem.get(sysName)!;
      if (!typeGroup.has(typeName)) typeGroup.set(typeName, { type: typeName, items: [] });
      typeGroup.get(typeName)!.items.push({ ...c, stock: stockMap.get(c.id) });
    }
    return Array.from(bySystem.entries()).map(([sys, typeMap]) => ({
      system: sys,
      types: Array.from(typeMap.values()).sort((a, b) => a.type.localeCompare(b.type)),
    })).sort((a, b) => a.system.localeCompare(b.system));
  }, [components.data, systems.data, types.data, stock.data, filterSystem, filterType]);

  const restock = async (itemId: string, delta: number) => {
    try {
      await adjustStockV2(itemId, delta, delta > 0 ? "Reposição de implante" : "Ajuste de implante");
      qc.invalidateQueries({ queryKey: ["implant_stock_items"] });
      qc.invalidateQueries({ queryKey: ["stock_items_v2"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterSystem} onValueChange={setFilterSystem}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Sistema" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os sistemas</SelectItem>
            {(systems.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(types.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground italic p-6 text-center border border-dashed rounded-xl">
          Nenhum componente de implante encontrado.
        </p>
      )}

      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.system} className="rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-sm font-medium">{g.system}</div>
            <div className="p-3 space-y-3">
              {g.types.map((t) => (
                <div key={t.type}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-1">{t.type}</div>
                  <div className="space-y-1">
                    {t.items.map((c: any) => {
                      const s = c.stock;
                      const low = s && Number(s.min_qty) > 0 && Number(s.qty_on_hand) <= Number(s.min_qty);
                      return (
                        <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 text-sm">
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className={`text-xs tabular-nums ${low ? "text-rose-500 font-semibold" : "text-muted-foreground"}`}>
                            {s ? `${Number(s.qty_on_hand)} / mín ${Number(s.min_qty)} ${s.unit}` : "—"}
                          </span>
                          {s && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => restock(s.id, +1)}>+1</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={async () => {
                                const value = await promptDialog({
                                  title: "Ajustar estoque",
                                  description: "Informe a quantidade a adicionar ou remover.",
                                  placeholder: "0",
                                  defaultValue: "0",
                                  confirmText: "Aplicar",
                                  required: true,
                                });
                                if (value === null) return;
                                const n = Number(value.replace(",", "."));
                                if (!isNaN(n) && n !== 0) restock(s.id, n);
                              }}>±</Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
