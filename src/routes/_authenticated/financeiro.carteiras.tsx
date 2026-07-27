// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Wallet as WalletIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/carteiras")({
  component: CarteirasPage,
});

type Wallet = {
  id: string;
  user_id: string;
  clinic_id: string | null;
  balance: number;
  profile?: { full_name: string | null; email: string | null } | null;
};

type Movement = {
  id: string;
  wallet_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  kind: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

const KIND_LABEL: Record<string, string> = {
  credit: "Crédito",
  debit: "Débito",
  advance: "Adiantamento",
  retention: "Retenção",
  bonus: "Bônus",
  adjustment: "Ajuste",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  earning: "Ganho de produção",
};

const POSTABLE_KINDS = ["credit", "debit", "advance", "retention", "bonus", "adjustment"] as const;

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function CarteirasPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const [postOpen, setPostOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  async function loadWallets() {
    setLoading(true);
    const { data: ws } = await supabase.from("user_wallets").select("*").order("balance", { ascending: false });
    const ids = (ws ?? []).map((w) => w.user_id);
    let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      profileMap = Object.fromEntries((profs ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
    }
    const merged: Wallet[] = (ws ?? []).map((w) => ({ ...w, profile: profileMap[w.user_id] ?? null })) as unknown as Wallet[];
    setWallets(merged);
    if (!selected && merged.length) setSelected(merged[0].id);
    setLoading(false);
  }

  async function loadMovements(walletId: string) {
    const { data } = await supabase
      .from("user_wallet_movements")
      .select("*")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false })
      .limit(200);
    setMovements((data ?? []) as unknown as Movement[]);
  }

  useEffect(() => {
    loadWallets();
  }, []);
  useEffect(() => {
    if (selected) loadMovements(selected);
  }, [selected]);

  const current = useMemo(() => wallets.find((w) => w.id === selected) ?? null, [wallets, selected]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">Contas internas</div>
          <h1 className="text-3xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">Carteiras</h1>
          <p className="text-sm text-slate-500 mt-2">Contas bancárias internas por profissional com extrato completo, transferências, adiantamentos, retenções, bônus e débitos.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={postOpen} onOpenChange={setPostOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!current}>Lançar movimento</Button>
            </DialogTrigger>
            <PostDialog wallet={current} onDone={() => { setPostOpen(false); loadWallets(); if (selected) loadMovements(selected); }} />
          </Dialog>
          <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
            <DialogTrigger asChild>
              <Button disabled={!current}><ArrowRightLeft className="h-4 w-4 mr-2" />Transferir</Button>
            </DialogTrigger>
            <TransferDialog wallets={wallets} from={current} onDone={() => { setTransferOpen(false); loadWallets(); if (selected) loadMovements(selected); }} />
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-8">
        {/* Wallet list */}
        <div className="space-y-2">
          {loading && <div className="text-sm text-slate-400">Carregando…</div>}
          {!loading && wallets.length === 0 && <div className="text-sm text-slate-400">Nenhuma carteira ainda.</div>}
          {wallets.map((w) => {
            const active = w.id === selected;
            return (
              <button
                key={w.id}
                onClick={() => setSelected(w.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  active
                    ? "bg-primary/5 border-primary/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"><WalletIcon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{w.profile?.full_name || w.profile?.email || w.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-500">Saldo</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{fmt(Number(w.balance))}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Statement */}
        <div className="space-y-4">
          {current && (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-xs text-slate-500 uppercase tracking-[0.08em]">Saldo atual</div>
              <div className="text-4xl font-extralight tabular-nums mt-1">{fmt(Number(current.balance))}</div>
              <div className="text-sm text-slate-500 mt-1">{current.profile?.full_name || current.profile?.email}</div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 text-sm font-medium">Extrato</div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {movements.length === 0 && <div className="p-6 text-sm text-slate-400">Sem lançamentos.</div>}
              {movements.map((m) => {
                const positive = Number(m.amount) >= 0;
                return (
                  <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                    <div className={`p-2 rounded-xl ${positive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50" : "bg-rose-50 text-rose-600 dark:bg-rose-950/50"}`}>
                      {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{KIND_LABEL[m.kind] ?? m.kind}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {new Date(m.created_at).toLocaleString("pt-BR")}
                        {m.notes ? ` · ${m.notes}` : ""}
                        {m.reference_type ? ` · ref: ${m.reference_type}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                        {positive ? "+" : ""}{fmt(Number(m.amount))}
                      </div>
                      <div className="text-xs text-slate-400 tabular-nums">Saldo: {fmt(Number(m.balance_after))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostDialog({ wallet, onDone }: { wallet: Wallet | null; onDone: () => void }) {
  const [kind, setKind] = useState<string>("credit");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!wallet) return;
    const v = Number(amount);
    if (!v || v <= 0) { toast.error("Valor inválido"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("wallet_post_movement", {
      _wallet_id: wallet.id,
      _kind: kind,
      _amount: v,
      _notes: notes || undefined,
      _reference_type: "manual",
      _reference_id: undefined,
    });
    setBusy(false);
    const res = data as { success: boolean; error?: string } | null;
    if (error || !res?.success) { toast.error(res?.error || error?.message || "Falha ao lançar"); return; }
    toast.success("Movimento lançado");
    setAmount(""); setNotes("");
    onDone();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Lançar movimento</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div><Label>Tipo</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {POSTABLE_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Observação</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo / referência" /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy}>Confirmar</Button></DialogFooter>
    </DialogContent>
  );
}

function TransferDialog({ wallets, from, onDone }: { wallets: Wallet[]; from: Wallet | null; onDone: () => void }) {
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!from || !to) { toast.error("Selecione destino"); return; }
    const v = Number(amount);
    if (!v || v <= 0) { toast.error("Valor inválido"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("wallet_transfer", {
      _from_wallet: from.id, _to_wallet: to, _amount: v, _notes: notes || undefined,
    });
    setBusy(false);
    const res = data as { success: boolean; error?: string } | null;
    if (error || !res?.success) { toast.error(res?.error || error?.message || "Falha"); return; }
    toast.success("Transferência realizada");
    setTo(""); setAmount(""); setNotes("");
    onDone();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Transferência interna</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="text-sm text-slate-500">De: <span className="font-medium text-slate-800 dark:text-slate-200">{from?.profile?.full_name || from?.profile?.email || from?.user_id.slice(0, 8)}</span></div>
        <div><Label>Para</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Selecione a carteira destino" /></SelectTrigger>
            <SelectContent>
              {wallets.filter((w) => w.id !== from?.id).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.profile?.full_name || w.profile?.email || w.user_id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Observação</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo" /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy}>Transferir</Button></DialogFooter>
    </DialogContent>
  );
}
