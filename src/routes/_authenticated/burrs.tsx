import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TeethSelector } from "@/components/TeethSelector";
import {
  fetchBurrs, fetchBurrUsages, createBurr, removeBurr, deleteBurr,
  recordBurrUsage, deleteBurrUsage, fetchHolders, createHolder, deleteHolder,
  BURR_CODES, type Burr, type BurrCode, type BurrMaterial, type Holder,
} from "@/lib/burrs";
import { Plus, ArrowRightLeft, Trash2, Cog } from "lucide-react";

export const Route = createFileRoute("/_authenticated/burrs")({ component: BurrsPage });

const MAT_LABEL: Record<BurrMaterial, string> = {
  zirconia: "Zircônia",
  dissilicato: "Dissilicato",
};

function BurrsPage() {
  const qc = useQueryClient();
  const burrs = useQuery({ queryKey: ["burrs"], queryFn: fetchBurrs });
  const usages = useQuery({ queryKey: ["burr_usages"], queryFn: () => fetchBurrUsages() });
  const holders = useQuery({ queryKey: ["holders"], queryFn: fetchHolders });

  const usageByBurr = new Map<string, Array<{ id: string; teeth_count: number; teeth_numbers: number[]; case_id: string | null; milled_at: string }>>();
  for (const u of usages.data ?? []) {
    const arr = usageByBurr.get(u.burr_id) ?? [];
    arr.push(u);
    usageByBurr.set(u.burr_id, arr);
  }

  const totalFor = (burrId: string) =>
    (usageByBurr.get(burrId) ?? []).reduce((sum, u) => sum + (u.teeth_count ?? 0), 0);

  const active = (burrs.data ?? []).filter((b) => !b.removed_at);
  const past = (burrs.data ?? []).filter((b) => b.removed_at);

  const holderName = (id: string | null) =>
    holders.data?.find((h) => h.id === id)?.name ?? "—";

  const [toDelete, setToDelete] = useState<Burr | null>(null);
  const [toDeleteUsage, setToDeleteUsage] = useState<string | null>(null);

  const removeMut = useMutation({
    mutationFn: removeBurr,
    onSuccess: () => { toast.success("Fresa marcada como removida"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteBurr,
    onSuccess: () => { toast.success("Fresa excluída"); qc.invalidateQueries(); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteUsageMut = useMutation({
    mutationFn: deleteBurrUsage,
    onSuccess: () => { toast.success("Registro removido"); qc.invalidateQueries(); setToDeleteUsage(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-[1600px] mx-auto w-full px-6 md:px-16 py-8 md:py-10">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-light text-slate-900 leading-tight tracking-tight flex items-center gap-2">
            <Cog className="h-7 w-7" /> Controle de Fresas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada holder mantém uma broca ativa por material (zircônia / dissilicato).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <HoldersDialog holders={holders.data ?? []} />
          <NewBurrDialog holders={holders.data ?? []} />
          <RecordUsageDialog burrs={active} />
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Fresas em uso
        </h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
            Nenhuma fresa ativa. Cadastre um holder e depois uma broca para começar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((b) => {
              const list = usageByBurr.get(b.id) ?? [];
              return (
                <div key={b.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-bold">
                        {b.code ?? b.name} · <span className="text-muted-foreground font-normal">{holderName(b.holder_id)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {MAT_LABEL[b.material as BurrMaterial]} · instalada em{" "}
                        {new Date(b.installed_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-extrabold tabular-nums text-primary">{totalFor(b.id)}</div>
                      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">dentes fresados</div>
                    </div>
                  </div>
                  {b.notes && <p className="text-xs text-muted-foreground mt-2">{b.notes}</p>}
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => removeMut.mutate(b.id)}>
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Trocar fresa
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive"
                      onClick={() => setToDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3 space-y-1.5 max-h-40 overflow-y-auto">
                      {list.map((u) => (
                        <UsageRow key={u.id} usage={u} onDelete={() => setToDeleteUsage(u.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Histórico
        </h2>
        {past.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhuma fresa no histórico ainda.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {past.map((b) => (
              <div key={b.id} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-semibold">{b.code ?? b.name} · <span className="text-muted-foreground font-normal">{holderName(b.holder_id)}</span></div>
                <div className="text-xs text-muted-foreground">
                  {MAT_LABEL[b.material as BurrMaterial]} · {new Date(b.installed_at).toLocaleDateString("pt-BR")}{" → "}
                  {b.removed_at ? new Date(b.removed_at).toLocaleDateString("pt-BR") : ""}
                </div>
                <div className="mt-1 text-xs"><b>{totalFor(b.id)}</b> dentes no total</div>
                <button
                  className="text-[11px] text-destructive mt-2 hover:underline"
                  onClick={() => setToDelete(b)}
                >
                  Excluir registro permanentemente
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove a fresa <b>{toDelete?.code ?? toDelete?.name}</b> e todos os registros de fresagem associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteMut.mutate(toDelete.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDeleteUsage} onOpenChange={(o) => !o && setToDeleteUsage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de fresagem?</AlertDialogTitle>
            <AlertDialogDescription>O registro será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDeleteUsage && deleteUsageMut.mutate(toDeleteUsage)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UsageRow({ usage, onDelete }: { usage: { id: string; teeth_count: number; teeth_numbers: number[]; case_id: string | null; milled_at: string }; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <div className="min-w-0 truncate">
        <span className="font-semibold tabular-nums">{usage.teeth_count}</span> dente(s){" "}
        <span className="text-muted-foreground">[{usage.teeth_numbers.join(", ") || "—"}]</span>
        <span className="text-muted-foreground"> · {new Date(usage.milled_at).toLocaleDateString("pt-BR")}</span>
      </div>
      <button onClick={onDelete} className="text-destructive hover:underline shrink-0">excluir</button>
    </div>
  );
}

function HoldersDialog({ holders }: { holders: Holder[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: () => createHolder({ name: name.trim(), notes: notes || null }),
    onSuccess: () => { toast.success("Holder cadastrado"); qc.invalidateQueries(); setName(""); setNotes(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deleteHolder,
    onSuccess: () => { toast.success("Holder excluído"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">Holders</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Holders cadastrados</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border max-h-60 overflow-y-auto">
            {holders.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3">Nenhum holder cadastrado.</div>
            ) : holders.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-2 border-b last:border-0 text-sm">
                <div>
                  <div className="font-semibold">{h.name}</div>
                  {h.notes && <div className="text-xs text-muted-foreground">{h.notes}</div>}
                </div>
                <button className="text-xs text-destructive hover:underline" onClick={() => delMut.mutate(h.id)}>excluir</button>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <Label>Novo holder</Label>
            <Input placeholder="Nome (ex.: Holder A)" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea placeholder="Observações (opcional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Cadastrar holder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewBurrDialog({ holders }: { holders: Holder[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<BurrCode>("T1");
  const [holderId, setHolderId] = useState<string>("");
  const [material, setMaterial] = useState<BurrMaterial>("zirconia");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => createBurr({ code, holder_id: holderId, material, notes: notes || null }),
    onSuccess: () => {
      toast.success("Fresa cadastrada");
      qc.invalidateQueries();
      setOpen(false);
      setCode("T1"); setHolderId(""); setNotes(""); setMaterial("zirconia");
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("burrs_one_active_per_holder_material")
        ? "Esse holder já tem uma broca ativa para esse material. Troque-a antes."
        : e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Nova fresa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar nova fresa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Holder</Label>
            <Select value={holderId} onValueChange={setHolderId}>
              <SelectTrigger><SelectValue placeholder={holders.length ? "Selecione" : "Cadastre um holder primeiro"} /></SelectTrigger>
              <SelectContent>
                {holders.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Broca</Label>
              <Select value={code} onValueChange={(v) => setCode(v as BurrCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BURR_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Material</Label>
              <Select value={material} onValueChange={(v) => setMaterial(v as BurrMaterial)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zirconia">Zircônia</SelectItem>
                  <SelectItem value="dissilicato">Dissilicato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!holderId || mut.isPending}>
            {mut.isPending ? "Salvando..." : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordUsageDialog({ burrs }: { burrs: Burr[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [burrId, setBurrId] = useState("");
  const [teeth, setTeeth] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const selectedBurr = burrs.find((b) => b.id === burrId);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selectedBurr) throw new Error("Selecione uma fresa");
      if (!teeth.length) throw new Error("Selecione ao menos um dente");
      await recordBurrUsage({
        burr_id: selectedBurr.id,
        material: selectedBurr.material,
        teeth_numbers: teeth,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast.success("Registro adicionado");
      qc.invalidateQueries();
      setOpen(false);
      setBurrId(""); setTeeth([]); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">Registrar fresagem</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Registrar fresagem manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Fresa</Label>
            <Select value={burrId} onValueChange={setBurrId}>
              <SelectTrigger><SelectValue placeholder="Selecione a fresa" /></SelectTrigger>
              <SelectContent>
                {burrs.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {(b.code ?? b.name)} · {MAT_LABEL[b.material as BurrMaterial]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dentes fresados</Label>
            <TeethSelector value={teeth} onChange={setTeeth} />
            <div className="text-xs text-muted-foreground">{teeth.length} selecionado(s)</div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
