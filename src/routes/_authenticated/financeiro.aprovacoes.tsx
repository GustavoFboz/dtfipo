// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, X, Pencil, DollarSign, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/aprovacoes")({
  component: AprovacoesPage,
});

type Earning = {
  id: string; case_id: string | null; professional_id: string | null;
  amount: number; lifecycle_status: string; role: string | null;
  created_at: string; reference_type: string | null;
};
type Approval = {
  id: string; kind: string; title: string; description: string | null;
  amount: number | null; status: string; requested_by: string | null;
  requested_at: string; decided_by: string | null; decided_at: string | null;
  decision_notes: string | null;
};
type HistoryRow = {
  id: string; scope: string; target_id: string; action: string;
  actor_id: string | null; actor_role: string | null; notes: string | null;
  diff: Record<string, unknown>; created_at: string;
};

const APPROVER_ROLES = ["CEO", "ADMIN", "FINANCEIRO"];

function fmt(v: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
}

function AprovacoesPage() {
  const [isApprover, setIsApprover] = useState<boolean | null>(null);
  const [production, setProduction] = useState<Earning[]>([]);
  const [payments, setPayments] = useState<Earning[]>([]);
  const [requests, setRequests] = useState<Approval[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);

  async function loadPermission() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setIsApprover(false); return; }
    const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    setIsApprover(APPROVER_ROLES.includes(p?.role ?? ""));
  }

  async function loadAll() {
    const [{ data: prod }, { data: pay }, { data: req }, { data: hist }] = await Promise.all([
      supabase.from("financial_professional_earnings").select("*").eq("lifecycle_status", "pending").order("created_at", { ascending: false }).limit(200),
      supabase.from("financial_professional_earnings").select("*").eq("lifecycle_status", "approved").order("created_at", { ascending: false }).limit(200),
      supabase.from("financial_approvals").select("*").eq("status", "pending").order("requested_at", { ascending: false }).limit(200),
      supabase.from("financial_approval_history").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setProduction((prod ?? []) as unknown as Earning[]);
    setPayments((pay ?? []) as unknown as Earning[]);
    setRequests((req ?? []) as Approval[]);
    setHistory((hist ?? []) as HistoryRow[]);
  }

  useEffect(() => { loadPermission(); loadAll(); }, []);

  async function decideEarning(id: string, action: "approve" | "reject" | "pay" | "edit", amount?: number, notes?: string) {
    const { data, error } = await supabase.rpc("decide_earning", {
      _earning_id: id, _action: action,
      _amount: amount ?? undefined, _notes: notes ?? undefined,
    });
    const res = data as { success: boolean; error?: string } | null;
    if (error || !res?.success) { toast.error(res?.error || error?.message || "Falha"); return; }
    toast.success("Atualizado");
    loadAll();
  }

  async function decideApproval(id: string, action: "approve" | "reject" | "edit", amount?: number, notes?: string) {
    const { data, error } = await supabase.rpc("decide_approval", {
      _approval_id: id, _action: action,
      _amount: amount ?? undefined, _notes: notes ?? undefined,
    });
    const res = data as { success: boolean; error?: string } | null;
    if (error || !res?.success) { toast.error(res?.error || error?.message || "Falha"); return; }
    toast.success("Atualizado");
    loadAll();
  }

  const filteredHistory = historyTarget ? history.filter((h) => h.target_id === historyTarget) : history;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">Central</div>
        <h1 className="text-3xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">Aprovações Financeiras</h1>
        <p className="text-sm text-slate-500 mt-2">Visível para CEO, ADMIN e FINANCEIRO.</p>
      </div>

      {isApprover === false && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Você não possui permissão para aprovar. A tela está em modo somente leitura.
        </div>
      )}

      <Tabs defaultValue="production" className="space-y-6">
        <TabsList>
          <TabsTrigger value="production">Produções pendentes ({production.length})</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos pendentes ({payments.length})</TabsTrigger>
          <TabsTrigger value="requests">Solicitações ({requests.length})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <EarningsList items={production} disabled={!isApprover} onAction={decideEarning} onHistory={(id) => setHistoryTarget(id)} showPay={false} />
        </TabsContent>
        <TabsContent value="payments">
          <EarningsList items={payments} disabled={!isApprover} onAction={decideEarning} onHistory={(id) => setHistoryTarget(id)} showPay={true} />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsList items={requests} disabled={!isApprover} onAction={decideApproval} onHistory={(id) => setHistoryTarget(id)} />
        </TabsContent>
        <TabsContent value="history">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <div className="text-sm font-medium flex items-center gap-2"><History className="h-4 w-4" /> Histórico completo</div>
              {historyTarget && <Button size="sm" variant="ghost" onClick={() => setHistoryTarget(null)}>Limpar filtro</Button>}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredHistory.length === 0 && <div className="p-6 text-sm text-slate-400">Sem eventos.</div>}
              {filteredHistory.map((h) => (
                <div key={h.id} className="px-6 py-3 text-sm flex flex-wrap items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.08em] text-slate-400">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs">{h.scope}</span>
                  <span className="font-medium">{h.action}</span>
                  {h.actor_role && <span className="text-xs text-slate-500">por {h.actor_role}</span>}
                  {h.notes && <span className="text-xs text-slate-500">— {h.notes}</span>}
                  <code className="text-[10px] text-slate-400 ml-auto">{h.target_id.slice(0, 8)}</code>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EarningsList({
  items, disabled, onAction, onHistory, showPay,
}: {
  items: Earning[]; disabled: boolean; showPay: boolean;
  onAction: (id: string, action: "approve" | "reject" | "pay" | "edit", amount?: number, notes?: string) => void;
  onHistory: (id: string) => void;
}) {
  if (items.length === 0) return <div className="p-6 text-sm text-slate-400 border border-dashed rounded-2xl">Nada pendente.</div>;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((e) => (
        <div key={e.id} className="px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{fmt(Number(e.amount))} <span className="text-xs text-slate-500 font-normal">· {e.role ?? "—"}</span></div>
            <div className="text-xs text-slate-500 truncate">
              Caso {e.case_id?.slice(0, 8) ?? "—"} · Prof {e.professional_id?.slice(0, 8) ?? "—"} · {new Date(e.created_at).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <div className="flex gap-2">
            <EditDialog current={Number(e.amount)} disabled={disabled} onSave={(v, n) => onAction(e.id, "edit", v, n)} />
            {showPay ? (
              <Button size="sm" disabled={disabled} onClick={() => onAction(e.id, "pay")}><DollarSign className="h-3.5 w-3.5 mr-1" />Pagar</Button>
            ) : (
              <Button size="sm" disabled={disabled} onClick={() => onAction(e.id, "approve")}><Check className="h-3.5 w-3.5 mr-1" />Aprovar</Button>
            )}
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAction(e.id, "reject")}><X className="h-3.5 w-3.5 mr-1" />Rejeitar</Button>
            <Button size="sm" variant="ghost" onClick={() => onHistory(e.id)}><History className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestsList({
  items, disabled, onAction, onHistory,
}: {
  items: Approval[]; disabled: boolean;
  onAction: (id: string, action: "approve" | "reject" | "edit", amount?: number, notes?: string) => void;
  onHistory: (id: string) => void;
}) {
  if (items.length === 0) return <div className="p-6 text-sm text-slate-400 border border-dashed rounded-2xl">Nenhuma solicitação.</div>;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((a) => (
        <div key={a.id} className="px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{a.title} <span className="text-xs text-slate-500 font-normal">· {a.kind}</span></div>
            <div className="text-xs text-slate-500 truncate">
              {a.amount != null ? fmt(Number(a.amount)) + " · " : ""}{new Date(a.requested_at).toLocaleString("pt-BR")}
              {a.description ? ` · ${a.description}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <EditDialog current={Number(a.amount ?? 0)} disabled={disabled} onSave={(v, n) => onAction(a.id, "edit", v, n)} />
            <Button size="sm" disabled={disabled} onClick={() => onAction(a.id, "approve")}><Check className="h-3.5 w-3.5 mr-1" />Aprovar</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAction(a.id, "reject")}><X className="h-3.5 w-3.5 mr-1" />Rejeitar</Button>
            <Button size="sm" variant="ghost" onClick={() => onHistory(a.id)}><History className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditDialog({ current, disabled, onSave }: { current: number; disabled: boolean; onSave: (amount: number, notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(current));
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar valor</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Novo valor (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Motivo</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Justificativa" /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSave(Number(amount), notes); setOpen(false); }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
