import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  File,
  FileArchive,
  FileImage,
  FileText,
  HardDrive,
  Search,
  Trash2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { fetchProfile } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import {
  deleteManagedStorageFile,
  fetchStorageFiles,
  formatStorageBytes,
  getStorageUsageSnapshot,
  refreshStorageUsage,
  storageSourceLabel,
  subscribeStorageUsage,
  type ManagedStorageFile,
} from "@/lib/storage";

function canManageStorage(profile: Awaited<ReturnType<typeof fetchProfile>>) {
  if (!profile) return false;
  const effective = String((profile as any).account_subtype || profile.role || "").toUpperCase();
  return !!profile.is_default_admin || effective === "CEO" || effective === "ADMIN";
}

function sourceIcon(file: ManagedStorageFile) {
  if ((file.mime_type || "").startsWith("image/")) return FileImage;
  if (/\.(zip|rar|7z)$/i.test(file.original_name)) return FileArchive;
  if (/\.(pdf|doc|docx|txt|html)$/i.test(file.original_name)) return FileText;
  return File;
}

function fmtDate(value: string) {
  try { return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return "—"; }
}

export function StorageManagementPage({ context = "laboratory" }: { context?: "laboratory" | "clinic" }) {
  const clinicMode = context === "clinic";
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const storage = useSyncExternalStore(subscribeStorageUsage, getStorageUsageSnapshot, getStorageUsageSnapshot);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");

  const allowed = canManageStorage(profile.data ?? null);
  const files = useQuery({ queryKey: ["storage_files"], queryFn: fetchStorageFiles, enabled: allowed, staleTime: 5_000 });

  useEffect(() => {
    if (!allowed) return;
    void refreshStorageUsage().catch(() => undefined);
  }, [allowed]);

  const del = useMutation({
    mutationFn: deleteManagedStorageFile,
    onMutate: async (file) => {
      await qc.cancelQueries({ queryKey: ["storage_files"] });
      const previous = qc.getQueryData<ManagedStorageFile[]>(["storage_files"]);
      qc.setQueryData<ManagedStorageFile[]>(["storage_files"], (old) => (old ?? []).filter((row) => row.id !== file.id));
      return { previous };
    },
    onError: (error: Error, _file, ctx) => {
      if (ctx?.previous) qc.setQueryData(["storage_files"], ctx.previous);
      toast.error(error.message || "Não foi possível excluir o arquivo");
    },
    onSuccess: () => {
      toast.success("Arquivo removido");
      void qc.invalidateQueries({ queryKey: ["storage_files"] });
      void refreshStorageUsage().catch(() => undefined);
    },
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (files.data ?? []).filter((file) => {
      if (source !== "all" && file.source_type !== source) return false;
      if (!term) return true;
      return [file.original_name, file.mime_type, storageSourceLabel(file.source_type)].filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [files.data, search, source]);

  const bySource = useMemo(() => {
    const out = new Map<string, number>();
    for (const file of files.data ?? []) out.set(file.source_type, (out.get(file.source_type) ?? 0) + 1);
    return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files.data]);

  const accentText = clinicMode ? "text-[#1e8f87]" : "text-primary";
  const accentBg = clinicMode ? "bg-[#1e8f87]" : "bg-primary";
  const focusRing = clinicMode ? "focus:ring-[#1e8f87]/15 focus:border-[#1e8f87]/30" : "focus:ring-primary/15 focus:border-primary/30";

  if (profile.isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando armazenamento…</div>;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl p-8 md:p-12">
        <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-950">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <h1 className="text-xl font-medium text-slate-900 dark:text-white">Área administrativa</h1>
          <p className="mt-2 text-sm text-slate-500">Somente Admin e CEO podem visualizar e gerenciar o armazenamento da organização.</p>
          <Link to={(clinicMode ? "/clinica" : "/casos") as any} className={`mt-5 inline-flex text-sm hover:underline ${accentText}`}>Voltar</Link>
        </div>
      </div>
    );
  }

  const usage = storage.data;
  const pct = usage ? Math.min(100, Math.max(0, usage.usage_ratio * 100)) : 0;
  const warning = !!usage?.almost_full;
  const full = !!usage?.full;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 md:p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={`mb-2 flex items-center gap-2 ${accentText}`}>
            <HardDrive className="h-5 w-5 stroke-[1.6px]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Armazenamento DentalFlow</span>
          </div>
          <h1 className="text-3xl font-light tracking-tight text-slate-900 md:text-4xl dark:text-white">Arquivos em um só lugar</h1>
          <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">O armazenamento é compartilhado pela organização. Arquivos de pacientes, casos e demais ambientes aparecem aqui sem duplicação.</p>
        </div>
        <button onClick={() => { void refreshStorageUsage(); void files.refetch(); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-[0_18px_45px_-36px_rgba(15,23,42,.55)] md:p-7 dark:border-white/[0.08] dark:bg-slate-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">Espaço disponível</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-light tracking-tight text-slate-900 dark:text-white">{usage ? formatStorageBytes(usage.available_bytes) : "—"}</span>
                <span className={`text-sm font-medium ${accentText}`}>livres</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{usage ? `${formatStorageBytes(usage.used_bytes)} de ${formatStorageBytes(usage.limit_bytes)} usados` : "Calculando…"}</p>
            </div>
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r="31" fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-100 dark:text-white/10" />
                <circle cx="40" cy="40" r="31" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 31}`} strokeDashoffset={`${2 * Math.PI * 31 * (1 - pct / 100)}`} className={full ? "text-rose-500" : warning ? "text-amber-500" : accentText} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-sm font-medium text-slate-700 dark:text-slate-200">{Math.round(pct)}%</span>
            </div>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className={`h-full rounded-full transition-all duration-300 ${full ? "bg-rose-500" : warning ? "bg-amber-500" : accentBg}`} style={{ width: `${pct}%` }} />
          </div>
          {warning && <div className={`mt-4 flex items-start gap-3 rounded-2xl px-4 py-3 ${full ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-xs leading-relaxed">{full ? "O limite foi atingido. Novos uploads ficam bloqueados até que arquivos sejam removidos." : "O armazenamento está próximo do limite. Considere remover arquivos que não são mais necessários."}</p></div>}
          {usage && !usage.quota_enforced && <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-white/[0.04]">A medição unificada será ativada quando a migration de armazenamento estiver disponível no banco.</div>}
        </div>

        <div className="rounded-[28px] border border-slate-100 bg-slate-50/60 p-6 md:p-7 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <p className="text-xs text-slate-400">Resumo</p>
          <div className="mt-5 space-y-4">
            <div className="flex items-end justify-between"><span className="text-sm text-slate-500">Arquivos</span><strong className="text-2xl font-light text-slate-900 dark:text-white">{usage?.file_count ?? files.data?.length ?? 0}</strong></div>
            <div className="h-px bg-slate-100 dark:bg-white/10" />
            <div className="flex items-end justify-between"><span className="text-sm text-slate-500">Cota atual</span><strong className="text-lg font-medium text-slate-900 dark:text-white">{usage ? formatStorageBytes(usage.limit_bytes) : "—"}</strong></div>
            <p className="text-[11px] font-light leading-relaxed text-slate-400">A mesma cota acompanha a organização entre Clínica, Laboratório e, futuramente, Radiologia.</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-[0_18px_45px_-38px_rgba(15,23,42,.45)] dark:border-white/[0.08] dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 md:p-5 dark:border-white/[0.08]">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, tipo ou origem…" className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] ${focusRing}`} />
          </div>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
            <option value="all">Todas as origens</option>
            {bySource.map(([key, count]) => <option key={key} value={key}>{storageSourceLabel(key)} ({count})</option>)}
          </select>
        </div>

        <div className="hidden grid-cols-[minmax(260px,1fr)_150px_120px_170px_50px] gap-3 bg-slate-50/70 px-5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 md:grid dark:bg-white/[0.025]">
          <span>Arquivo</span><span>Origem</span><span>Tamanho</span><span>Adicionado</span><span />
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/[0.07]">
          {visible.map((file) => {
            const Icon = sourceIcon(file);
            return (
              <div key={file.id} className="grid items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50/60 md:grid-cols-[minmax(260px,1fr)_150px_120px_170px_50px] dark:hover:bg-white/[0.025]">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${clinicMode ? "bg-[#1e8f87]/[0.07] text-[#1e8f87]" : "bg-primary/[0.07] text-primary"}`}><Icon className="h-4 w-4 stroke-[1.5px]" /></div>
                  <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{file.original_name}</div><div className="truncate text-[10.5px] text-slate-400">{file.mime_type || "tipo não informado"}</div></div>
                </div>
                <div className="text-xs text-slate-500">{storageSourceLabel(file.source_type)}</div>
                <div className="text-xs tabular-nums text-slate-500">{formatStorageBytes(file.size_bytes)}</div>
                <div className="text-xs text-slate-400">{fmtDate(file.created_at)}</div>
                <button disabled={del.isPending} onClick={async () => { const ok = await confirm({ title: "Remover arquivo", description: `Excluir “${file.original_name}” permanentemente? Esta ação também remove o arquivo de onde ele estiver anexado.`, confirmText: "Excluir", destructive: true }); if (ok) del.mutate(file); }} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-950/20" title="Excluir permanentemente"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          {!files.isLoading && visible.length === 0 && <div className="px-6 py-16 text-center"><HardDrive className="mx-auto h-9 w-9 text-slate-200" /><p className="mt-3 text-sm text-slate-500">Nenhum arquivo encontrado.</p><p className="mt-1 text-xs text-slate-400">Os arquivos enviados para casos e pacientes aparecerão aqui automaticamente.</p></div>}
          {files.isLoading && <div className="px-6 py-12 text-center text-sm text-slate-400">Carregando arquivos…</div>}
        </div>
      </section>
    </div>
  );
}
