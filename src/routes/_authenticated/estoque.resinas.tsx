import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Bluetooth, Droplet, Plus, Scale, Trash2, Pencil, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirm } from "@/lib/confirm";
import {
  fetchResinPots, createResinPot, updateResinPot, deleteResinPot,
  addResinWeighing, fetchResinWeighings, fmtKg, type ResinPot,
} from "@/lib/resins";
import { connectScale, isScaleSupported } from "@/lib/scale-bluetooth";

export const Route = createFileRoute("/_authenticated/estoque/resinas")({
  component: ResinasPage,
  head: () => ({
    meta: [
      { title: "Resinas por peso | DentalFlow Pro" },
      { name: "description", content: "Controle de resinas por quilo com tara do pote, pesagens manuais ou por balança Bluetooth." },
      { property: "og:title", content: "Resinas por peso | DentalFlow Pro" },
      { property: "og:description", content: "Controle de resinas por quilo com tara do pote e pesagens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResinasPage() {
  const qc = useQueryClient();
  const pots = useQuery({ queryKey: ["resin_pots"], queryFn: fetchResinPots });
  const [editing, setEditing] = useState<ResinPot | null>(null);
  const [creating, setCreating] = useState(false);
  const [weighing, setWeighing] = useState<ResinPot | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteResinPot(id),
    onSuccess: () => { toast.success("Pote removido"); qc.invalidateQueries({ queryKey: ["resin_pots"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const low = (pots.data ?? []).filter((p) => p.min_net_g > 0 && p.current_net_g < p.min_net_g).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link to="/estoque" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao estoque
      </Link>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-light flex items-center gap-2">
            <Droplet className="h-5 w-5 text-primary" /> Resinas por peso
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Informe a tara (peso do pote vazio) uma única vez. A cada pesagem o sistema desconta a tara e
            atualiza a quantidade real de resina.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo pote
        </Button>
      </div>

      {low > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" /> {low} pote(s) abaixo do mínimo.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(pots.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-10 text-center">
            Nenhum pote de resina cadastrado.
          </p>
        )}
        {(pots.data ?? []).map((p) => {
          const pct = p.declared_net_g > 0 ? Math.max(0, Math.min(100, (p.current_net_g / p.declared_net_g) * 100)) : 0;
          const isLow = p.min_net_g > 0 && p.current_net_g < p.min_net_g;
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[p.brand, p.type, p.color].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setEditing(p)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: "Remover pote", description: `Remover "${p.name}"?`, confirmText: "Remover", destructive: true })) del.mutate(p.id);
                    }}
                    className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between">
                  <span className={`text-xl font-light tabular-nums ${isLow ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {fmtKg(p.current_net_g)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">de {fmtKg(p.declared_net_g)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Tara: {fmtKg(p.tare_g)} · Validade: {p.expires_on ? new Date(p.expires_on).toLocaleDateString("pt-BR") : "—"}
                </div>
              </div>

              <Button size="sm" variant="secondary" className="w-full rounded-xl" onClick={() => setWeighing(p)}>
                <Scale className="h-4 w-4 mr-1.5" /> Pesar / repor
              </Button>
            </div>
          );
        })}
      </div>

      <PotDialog
        open={creating || !!editing}
        pot={editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
      />
      <WeighDialog pot={weighing} onOpenChange={(v) => !v && setWeighing(null)} />
    </div>
  );
}

function PotDialog({ open, pot, onOpenChange }: { open: boolean; pot: ResinPot | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ResinPot>>({});
  const key = pot?.id ?? "new";
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && seeded !== key) {
    setSeeded(key);
    setForm(pot ? { ...pot } : { tare_g: 0, declared_net_g: 1000, min_net_g: 0 });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name?.trim()) throw new Error("Informe o nome do pote");
      if (pot) await updateResinPot(pot.id, form);
      else await createResinPot(form);
    },
    onSuccess: () => {
      toast.success(pot ? "Pote atualizado" : "Pote criado");
      qc.invalidateQueries({ queryKey: ["resin_pots"] });
      setSeeded(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (v: number | undefined) => (v ?? 0) / 1000;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSeeded(null); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">{pot ? "Editar pote" : "Novo pote de resina"}</DialogTitle>
          <DialogDescription className="text-xs">
            A tara é o peso do pote vazio (excedente). Informe uma vez — todas as pesagens já saem descontadas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" placeholder="Ex.: Resina modelo A2 — pote 1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Marca</Label>
              <Input value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Input value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <Input value={form.color ?? ""} onChange={(e) => setForm({ ...form, color: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Validade</Label>
              <Input type="date" value={form.expires_on ?? ""} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Conteúdo declarado (kg)</Label>
              <Input type="number" step="0.001" value={num(form.declared_net_g)}
                onChange={(e) => setForm({ ...form, declared_net_g: Math.round(Number(e.target.value) * 1000) })}
                className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tara — pote vazio (kg)</Label>
              <Input type="number" step="0.001" value={num(form.tare_g)}
                onChange={(e) => setForm({ ...form, tare_g: Math.round(Number(e.target.value) * 1000) })}
                className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mínimo (kg)</Label>
              <Input type="number" step="0.001" value={num(form.min_net_g)}
                onChange={(e) => setForm({ ...form, min_net_g: Math.round(Number(e.target.value) * 1000) })}
                className="rounded-xl" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeighDialog({ pot, onOpenChange }: { pot: ResinPot | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [gross, setGross] = useState("");
  const [live, setLive] = useState<number | null>(null);
  const [disconnect, setDisconnect] = useState<(() => void) | null>(null);

  const hist = useQuery({
    queryKey: ["resin_weighings", pot?.id],
    queryFn: () => fetchResinWeighings(pot!.id),
    enabled: !!pot,
  });

  const grossG = live ?? (gross ? Math.round(Number(gross) * 1000) : 0);
  const netG = pot ? Math.max(0, grossG - pot.tare_g) : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!pot) return;
      if (!grossG) throw new Error("Informe o peso bruto");
      await addResinWeighing(pot.id, grossG, live !== null ? "scale" : "manual");
    },
    onSuccess: () => {
      toast.success("Pesagem registrada");
      qc.invalidateQueries({ queryKey: ["resin_pots"] });
      qc.invalidateQueries({ queryKey: ["resin_weighings", pot?.id] });
      setGross(""); setLive(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connect = async () => {
    try {
      const off = await connectScale((g) => setLive(g));
      setDisconnect(() => off);
      toast.success("Balança conectada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const close = (v: boolean) => {
    if (!v) { disconnect?.(); setDisconnect(null); setLive(null); setGross(""); }
    onOpenChange(v);
  };

  return (
    <Dialog open={!!pot} onOpenChange={close}>
      <DialogContent className="sm:max-w-[460px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">Pesar {pot?.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Coloque o pote na balança. Digite o peso bruto ou conecte a balança Bluetooth.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Peso bruto (kg)</Label>
            <Input
              type="number" step="0.001" value={live !== null ? (live / 1000).toFixed(3) : gross}
              onChange={(e) => { setLive(null); setGross(e.target.value); }}
              className="rounded-xl text-lg tabular-nums" placeholder="0,000"
            />
          </div>
          <div className="rounded-xl border border-border px-3 py-2.5 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Resina (bruto − tara {fmtKg(pot?.tare_g ?? 0)})</span>
            <span className="font-medium tabular-nums">{fmtKg(netG)}</span>
          </div>
          {isScaleSupported() && (
            <Button variant="secondary" className="w-full rounded-xl" onClick={connect} disabled={!!disconnect}>
              <Bluetooth className="h-4 w-4 mr-1.5" />
              {disconnect ? "Balança conectada" : "Conectar balança Bluetooth"}
            </Button>
          )}

          {!!hist.data?.length && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <div className="text-xs text-muted-foreground">Histórico</div>
              {hist.data.map((w) => (
                <div key={w.id} className="flex items-center justify-between text-[12px] border-b border-border/60 py-1">
                  <span className="text-muted-foreground">{new Date(w.created_at).toLocaleString("pt-BR")}</span>
                  <span className="tabular-nums">{fmtKg(w.net_g)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => close(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={save.isPending || !grossG} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Registrar pesagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
