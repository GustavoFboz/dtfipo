import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm } from "@/lib/confirm";
import { toast } from "sonner";
import {
  Package, Plus, Trash2, Pencil, ArrowUpDown, AlertTriangle, FolderPlus, X, Wrench,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchStockCategoriesV2, createStockCategoryV2, updateStockCategoryV2, deleteStockCategoryV2,
  fetchStockItemsV2, createStockItemV2, updateStockItemV2, deleteStockItemV2, adjustStockV2,
  linkStockItemToImplantSystem,
  type StockCategory, type StockItemV2,
} from "@/lib/stock-v2";
import { fetchImplantSystems } from "@/lib/implants";
import { ImplantSystemsDialog } from "@/components/ImplantSystemsDialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/estoque")({ component: EstoquePage });

type SortKey = "name" | "brand" | "type" | "created_at" | "last_restocked_at" | "custom";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function EstoquePage() {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["stock_cats_v2"], queryFn: fetchStockCategoriesV2 });
  const items = useQuery({ queryKey: ["stock_items_v2"], queryFn: fetchStockItemsV2 });
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [customSortKey, setCustomSortKey] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StockItemV2 | null>(null);
  const [creating, setCreating] = useState(false);
  const [restocking, setRestocking] = useState<StockItemV2 | null>(null);
  const [managingCats, setManagingCats] = useState(false);
  const [managingImplants, setManagingImplants] = useState(false);

  const activeCat = selectedCat ?? cats.data?.[0]?.id ?? null;
  const filteredItems = useMemo(() => {
    const list = (items.data ?? []).filter((i) => !activeCat || i.category_id === activeCat);
    const term = search.toLowerCase().trim();
    const searched = term
      ? list.filter((i) =>
          (i.name + " " + (i.brand ?? "") + " " + (i.type ?? "")).toLowerCase().includes(term)
        )
      : list;
    const sorted = [...searched].sort((a, b) => {
      const av = sort === "custom"
        ? (a.custom_fields?.find((f) => f.key === customSortKey)?.value ?? "")
        : sort === "created_at" || sort === "last_restocked_at"
          ? (a[sort] ?? "")
          : (a[sort] ?? "");
      const bv = sort === "custom"
        ? (b.custom_fields?.find((f) => f.key === customSortKey)?.value ?? "")
        : sort === "created_at" || sort === "last_restocked_at"
          ? (b[sort] ?? "")
          : (b[sort] ?? "");
      const cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [items.data, activeCat, sort, sortDir, customSortKey, search]);

  const allCustomKeys = useMemo(() => {
    const set = new Set<string>();
    (items.data ?? []).forEach((i) => i.custom_fields?.forEach((f) => set.add(f.key)));
    return Array.from(set).sort();
  }, [items.data]);

  const lowStockCount = (items.data ?? []).filter(
    (i) => Number(i.qty_on_hand) <= Number(i.min_qty) && Number(i.min_qty) > 0
  ).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock_items_v2"] });
    qc.invalidateQueries({ queryKey: ["stock_cats_v2"] });
  };

  return (
    <div className="p-6 md:p-10 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-light tracking-tight flex items-center gap-2">
            <Package className="h-7 w-7" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Categorias livres, itens com campos personalizados e histórico de reposições.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManagingImplants(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border border-border bg-background hover:bg-accent"
          >
            <Wrench className="h-3.5 w-3.5" /> Sistemas de Implantes
          </button>
          <button
            onClick={() => setManagingCats(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border border-border bg-background hover:bg-accent"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Categorias
          </button>
          <button
            onClick={() => setCreating(true)}
            disabled={!cats.data?.length}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Novo item
          </button>
        </div>
      </div>

      {lowStockCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" /> {lowStockCount} item(ns) abaixo do estoque mínimo.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar de categorias */}
        <aside className="space-y-1.5">
          {cats.data?.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed border-border">
              Crie uma categoria para começar.
            </p>
          )}
          {(cats.data ?? []).map((c) => {
            const count = (items.data ?? []).filter((i) => i.category_id === c.id).length;
            const active = activeCat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between transition ${
                  active ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-accent border border-transparent"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </aside>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, marca, tipo…"
              className="h-9 px-3 rounded-lg border border-border bg-background text-sm flex-1 min-w-[200px]"
            />
            <div className="inline-flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Ordenar:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 px-2 rounded-lg border border-border bg-background"
              >
                <option value="name">Nome</option>
                <option value="brand">Marca</option>
                <option value="type">Tipo</option>
                <option value="created_at">Data de registro</option>
                <option value="last_restocked_at">Última reposição</option>
                {allCustomKeys.length > 0 && <option value="custom">Campo personalizado…</option>}
              </select>
              {sort === "custom" && (
                <select value={customSortKey} onChange={(e) => setCustomSortKey(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-border bg-background">
                  <option value="">(selecione)</option>
                  {allCustomKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              )}
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="h-9 px-2 rounded-lg border border-border bg-background hover:bg-accent inline-flex items-center gap-1"
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortDir === "asc" ? "A→Z" : "Z→A"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Nome</th>
                  <th className="text-left px-3 py-2.5 font-medium">Marca</th>
                  <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                  <th className="text-right px-3 py-2.5 font-medium">Qtd</th>
                  <th className="text-right px-3 py-2.5 font-medium">Mín</th>
                  <th className="text-left px-3 py-2.5 font-medium">Última reposição</th>
                  <th className="text-right px-3 py-2.5 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => {
                  const low = Number(i.qty_on_hand) <= Number(i.min_qty) && Number(i.min_qty) > 0;
                  return (
                    <tr key={i.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{i.name}</div>
                        {i.custom_fields && i.custom_fields.length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-1">
                            {i.custom_fields.map((f) => (
                              <span key={f.id} className="px-1.5 py-0.5 rounded bg-muted">
                                {f.key}: {f.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{i.brand ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{i.type ?? "—"}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${low ? "text-amber-600 font-semibold" : ""}`}>
                        {Number(i.qty_on_hand)} <span className="text-xs text-muted-foreground">{i.unit}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Number(i.min_qty)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(i.last_restocked_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setRestocking(i)} title="Reposição/ajuste"
                            className="px-2 py-1 rounded-md text-xs border border-border hover:bg-accent">+/−</button>
                          <button onClick={() => setEditing(i)} title="Editar"
                            className="p-1.5 rounded-md hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: "Excluir item", description: `Excluir "${i.name}"?`, confirmText: "Excluir", destructive: true }))) return;
                              try { await deleteStockItemV2(i.id); invalidate(); }
                              catch (e) { toast.error((e as Error).message); }
                            }}
                            title="Excluir"
                            className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          ><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {cats.data?.length ? "Nenhum item nesta categoria." : "Crie uma categoria para cadastrar itens."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {managingCats && (
        <CategoriesDialog
          categories={cats.data ?? []}
          onClose={() => setManagingCats(false)}
          onChanged={invalidate}
        />
      )}
      {(creating || editing) && (
        <ItemDialog
          item={editing}
          categories={cats.data ?? []}
          defaultCategoryId={activeCat}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={invalidate}
        />
      )}
      {restocking && (
        <RestockDialog
          item={restocking}
          onClose={() => setRestocking(null)}
          onSaved={invalidate}
        />
      )}
      <ImplantSystemsDialog open={managingImplants} onOpenChange={setManagingImplants} />
    </div>
  );
}

function CategoriesDialog({ categories, onClose, onChanged }: {
  categories: StockCategory[]; onClose: () => void; onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");

  async function add() {
    if (!newName.trim()) return;
    try {
      const pos = ((categories[categories.length - 1]?.position ?? 0) + 10);
      await createStockCategoryV2(newName.trim(), pos);
      setNewName(""); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Categorias de estoque</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Nova categoria…"
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm" />
            <button onClick={add} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Adicionar</button>
          </div>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {categories.map((c) => (
              <CategoryRow key={c.id} cat={c} onChanged={onChanged} />
            ))}
          </div>
        </div>
        <DialogFooter><button onClick={onClose} className="text-sm px-3 h-9 rounded-lg border border-border">Fechar</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ cat, onChanged }: { cat: StockCategory; onChanged: () => void }) {
  const [name, setName] = useState(cat.name);
  async function save() {
    if (name === cat.name) return;
    try { await updateStockCategoryV2(cat.id, { name }); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function remove() {
    if (!(await confirm({ title: "Excluir categoria", description: `Excluir a categoria "${cat.name}"? Itens existentes ficarão sem categoria.`, confirmText: "Excluir", destructive: true }))) return;
    try { await deleteStockCategoryV2(cat.id); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="flex items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
        className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-sm" />
      <button onClick={remove} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ItemDialog({ item, categories, defaultCategoryId, onClose, onSaved }: {
  item: StockItemV2 | null;
  categories: StockCategory[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const draftKey = `stock-item-draft:${item?.id ?? "new"}`;
  const draft = (() => {
    if (typeof window === "undefined") return null;
    try { const raw = window.localStorage.getItem(draftKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  })();
  const [categoryId, setCategoryId] = useState<string>(draft?.categoryId ?? item?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [name, setName] = useState<string>(draft?.name ?? item?.name ?? "");
  const [brand, setBrand] = useState<string>(draft?.brand ?? item?.brand ?? "");
  const [type, setType] = useState<string>(draft?.type ?? item?.type ?? "");
  const [unit, setUnit] = useState<string>(draft?.unit ?? item?.unit ?? "un");
  const [qty, setQty] = useState<string>(draft?.qty ?? String(item?.qty_on_hand ?? 0));
  const [minQty, setMinQty] = useState<string>(draft?.minQty ?? String(item?.min_qty ?? 0));
  const [fields, setFields] = useState<{ key: string; value: string }[]>(
    draft?.fields ?? item?.custom_fields?.map((f) => ({ key: f.key, value: f.value ?? "" })) ?? []
  );
  const [implantSystemId, setImplantSystemId] = useState<string>(draft?.implantSystemId ?? "");
  const implantSystems = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems });

  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({
        categoryId, name, brand, type, unit, qty, minQty, fields, implantSystemId,
      }));
    } catch { /* ignore quota */ }
  }, [draftKey, categoryId, name, brand, type, unit, qty, minQty, fields, implantSystemId]);

  function clearDraft() { try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ } }
  function handleCancel() { clearDraft(); onClose(); }

  // Ao editar, resolve o sistema atual a partir do component_id ligado.
  useMemo(() => {
    async function loadCurrent() {
      const cid = (item as any)?.implant_system_component_id as string | null | undefined;
      if (!cid || draft?.implantSystemId) return;
      const { data } = await supabase
        .from("implant_system_components" as any)
        .select("implant_system_id")
        .eq("id", cid)
        .maybeSingle();
      if ((data as any)?.implant_system_id) setImplantSystemId((data as any).implant_system_id);
    }
    void loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !categoryId) return toast.error("Nome e categoria são obrigatórios");
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === categoryId);
      let targetId = item?.id;
      if (item) {
        await updateStockItemV2(item.id, {
          category_id: categoryId,
          category_name: cat?.name,
          name: name.trim(),
          brand: brand.trim() || null,
          type: type.trim() || null,
          unit: unit.trim() || "un",
          qty_on_hand: Number(qty) || 0,
          min_qty: Number(minQty) || 0,
        }, fields);
      } else {
        targetId = await createStockItemV2({
          category_id: categoryId,
          category_name: cat?.name ?? "",
          name: name.trim(),
          brand: brand.trim() || null,
          type: type.trim() || null,
          unit: unit.trim() || "un",
          qty_on_hand: Number(qty) || 0,
          min_qty: Number(minQty) || 0,
          custom_fields: fields,
        });
      }
      if (targetId) {
        await linkStockItemToImplantSystem(
          targetId,
          name.trim(),
          implantSystemId || null,
          (item as any)?.implant_system_component_id ?? null,
        );
      }
      clearDraft();
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Categoria">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Nome"><Input value={name} onChange={setName} placeholder="Ex.: Base T 4.0 × 0.8 small" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca"><Input value={brand} onChange={setBrand} /></Field>
            <Field label="Tipo (texto livre)"><Input value={type} onChange={setType} /></Field>
          </div>
          <Field label="Sistema de implante (opcional)">
            <select
              value={implantSystemId}
              onChange={(e) => setImplantSystemId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
            >
              <option value="">— Nenhum —</option>
              {(implantSystems.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.line ? ` — ${s.line}` : ""}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Ao selecionar, o item aparece como componente do sistema (útil para Ti Base, análogos etc.).
            </p>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Medida (unidade)"><Input value={unit} onChange={setUnit} placeholder="un, mm, g…" /></Field>
            <Field label="Quantidade"><Input value={qty} onChange={setQty} type="number" /></Field>
            <Field label="Mínima"><Input value={minQty} onChange={setMinQty} type="number" /></Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">Campos personalizados</label>
              <button onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-1.5">
              {fields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={f.key} onChange={(e) => setFields((arr) => arr.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x))}
                    placeholder="Chave (ex.: Cor)" className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs" />
                  <input value={f.value} onChange={(e) => setFields((arr) => arr.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Valor (ex.: A2)" className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs" />
                  <button onClick={() => setFields((arr) => arr.filter((_, idx) => idx !== i))}
                    className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"><X className="h-3 w-3" /></button>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum campo. Ex.: "Cor": "A2".</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={handleCancel} className="text-sm px-3 h-9 rounded-lg border border-border">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="text-sm px-3 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestockDialog({ item, onClose, onSaved }: { item: StockItemV2; onClose: () => void; onSaved: () => void }) {
  const [delta, setDelta] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const d = Number(delta);
    if (!d) return toast.error("Informe uma quantidade diferente de 0");
    setSaving(true);
    try {
      await adjustStockV2(item.id, d, notes || undefined);
      onSaved(); onClose();
      toast.success(d > 0 ? "Reposição registrada" : "Saída registrada");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reposição / Ajuste — {item.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Quantidade atual: <strong className="text-foreground">{Number(item.qty_on_hand)} {item.unit}</strong>
          </p>
          <Field label="Delta (use número negativo para saída)"><Input value={delta} onChange={setDelta} type="number" /></Field>
          <Field label="Observação"><Input value={notes} onChange={setNotes} placeholder="Opcional" /></Field>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="text-sm px-3 h-9 rounded-lg border border-border">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="text-sm px-3 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Salvando…" : "Confirmar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder}
      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm" />
  );
}
