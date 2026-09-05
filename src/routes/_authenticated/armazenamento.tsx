import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/armazenamento")({ component: StoragePage });

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

function StoragePage() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const storage = useSyncExternalStore(subscribeStorageUsage, getStorageUsageSnapshot, getStorageUsageSnapshot);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");

  const allowed = canManageStorage(profile.data ?? null);
  const files = useQuery({
    queryKey: ["storage_files"],
    queryFn: fetchStorageFiles,
    enabled: allowed,
    staleTime: 5_000,
  });

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
    },
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (files.data ?? []).filter((file) => {
      if (source !== "all" && file.source_type !== source) return false;
      if (!term) return true;
      return [file.original_name, file.mime_type, storageSourceLabel(file.source_type)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [files.data, search, source]);

  const bySource = useMemo(() => {
    const out = new Map<string, number>();
    for (const file of files.data ?? []) out.set(file.source_type, (out.get(file.source_type) ?? 0) + 1);
    return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files.data]);

  if (profile.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando armazenamento…</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto p-8 md:p-12">
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-950 p-8 text-center shadow-sm">
          <ShieldCheck className="h-10 w-10 mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-medium text-slate-900 dark:text-white">Área administrativa</h1>
          <p className="mt-2 text-sm text-slate-500">Somente Admin e CEO podem visualizar e gerenciar o armazenamento da clínica.</p>
          <Link to="/casos" className="inline-flex mt-5 text-sm text-primary hover:underline">Voltar para casos</Link>
        </div>
      </div>
    );
  }

  const usage = storage.data;
  const pct = usage ? Math.min(100, Math.max(0, usage.usage_ratio * 100)) : 0;
  const warning = !!usage?.almost_full;
  const full = !!usage?.full;

  return (
    <div className="max-w-[1500px] mx-auto p-5 md:p-8 lg:p-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <HardDrive className="h-5 w-5 stroke-[1.6px]" />
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase">Armazenamento da clínica</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-slate-900 dark:text-white">Arquivos em um só lugar</h1>
          <p className="mt-2 text-sm text-slate-500 max-w-2xl">Visualize o consumo, encontre arquivos de casos e pacientes e libere espaço sem precisar abrir cada registro individualmente.</p>
        </div>
        <button
          onClick={() => { void refreshStorageUsage(); void files.refetch(); }}
          className="h-10 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 inline-flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <section className="grid lg:grid-cols-[1.4fr_0.6fr] gap-4">
        <div className="rounded-[28px] border border-slate-100 dark:border-white/[0.08] bg-white dark:bg-slate-950 p-6 md:p-7 shadow-[0_18px_45px_-36px_rgba(15,23,42,.55)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">Espaço disponível</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-light tracking-tight text-slate-900 dark:text-white">{usage ? formatStorageBytes(usage.available_bytes) : "—"}</span>
                <span className="text-sm font-medium text-primary">livres</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{usage ? `${formatStorageBytes(usage.used_bytes)} de ${formatStorageBytes(usage.limit_bytes)} usados` : "Calculando…"}</p>
            </div>
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r="31" fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-100 dark:text-white/10" />
                <circle cx="40" cy="40" r="31" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 31}`} strokeDashoffset={`${2 * Math.PI * 31 * (1 - pct / 100)}`}
                  className={full ? "text-rose-500" : warning ? "text-amber-500" : "text-primary"} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-sm font-medium text-slate-700 dark:text-slate-200">{Math.round(pct)}%</span>
            </div>
          </div>
          <div className="mt-6 h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${full ? "bg-rose-500" : warning ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
          {warning && (
            <div className={`mt-4 rounded-2xl px-4 py-3 flex items-start gap-3 ${full ? "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300" : "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"}`}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{full ? "O limite foi atingido. Novos uploads ficam bloqueados até que arquivos sejam removidos." : "O armazenamento está próximo do limite. Considere remover arquivos que não são mais necessários."}</p>
            </div>
          )}
          {usage && !usage.quota_enforced && (
            <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-xs text-slate-500">
              O painel está pronto, mas a medição unificada será ativada quando a migration de armazenamento for aplicada no Supabase.
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-slate-100 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.03] p-6 md:p-7">
          <p className="text-xs text-slate-400">Resumo</p>
          <div className="mt-5 space-y-4">
            <div className="flex items-end justify-between"><span className="text-sm text-slate-500">Arquivos</span><strong className="text-2xl font-light text-slate-900 dark:text-white">{usage?.file_count ?? files.data?.length ?? 0}</strong></div>
            <div className="h-px bg-slate-100 dark:bg-white/10" />
            <div className="flex items-end justify-between"><span className="text-sm text-slate-500">Cota atual</span><strong className="text-lg font-medium text-slate-900 dark:text-white">{usage ? formatStorageBytes(usage.limit_bytes) : "—"}</strong></div>
            <p className="text-[11px] leading-relaxed text-slate-400">A cota pertence à clínica e já considera o espaço incluído, adicionais comprados e cortesias ativas. O consumo é compartilhado entre todos os membros.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-100 dark:border-white/[0.08] bg-white dark:bg-slate-950 overflow-hidden shadow-[0_18px_45px_-38px_rgba(15,23,42,.45)]">
        <div className="p-4 md:p-5 border-b border-slate-100 dark:border-white/[0.08] flex items-center gap-3 flex-wrap">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, tipo ou origem…"
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30" />
          </div>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-950 text-sm text-slate-600 dark:text-slate-300">
            <option value="all">Todas as origens</option>
            {bySource.map(([key, count]) => <option key={key} value={key}>{storageSourceLabel(key)} ({count})</option>)}
          </select>
        </div>

        <div className="hidden md:grid grid-cols-[minmax(260px,1fr)_150px_120px_170px_50px] gap-3 px-5 py-2.5 bg-slate-50/70 dark:bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <span>Arquivo</span><span>Origem</span><span>Tamanho</span><span>Adicionado</span><span />
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/[0.07]">
          {visible.map((file) => {
            const Icon = sourceIcon(file);
            return (
              <div key={file.id} className="grid md:grid-cols-[minmax(260px,1fr)_150px_120px_170px_50px] gap-3 items-center px-5 py-3.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.025] transition">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/[0.07] text-primary grid place-items-center shrink-0"><Icon className="h-4 w-4 stroke-[1.5px]" /></div>
                  <div className="min-w-0"><div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{file.original_name}</div><div className="text-[10.5px] text-slate-400 truncate">{file.mime_type || "tipo não informado"}</div></div>
                </div>
                <div className="text-xs text-slate-500">{storageSourceLabel(file.source_type)}</div>
                <div className="text-xs tabular-nums text-slate-500">{formatStorageBytes(file.size_bytes)}</div>
                <div className="text-xs text-slate-400">{fmtDate(file.created_at)}</div>
                <button
                  disabled={del.isPending}
                  onClick={async () => {
                    const ok = await confirm({ title: "Remover arquivo", description: `Excluir “${file.original_name}” permanentemente? Esta ação também remove o arquivo de onde ele estiver anexado.`, confirmText: "Excluir", destructive: true });
                    if (ok) del.mutate(file);
                  }}
                  className="h-9 w-9 rounded-xl grid place-items-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition disabled:opacity-40"
                  title="Excluir permanentemente"
                ><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}

          {!files.isLoading && visible.length === 0 && (
            <div className="px-6 py-16 text-center"><HardDrive className="h-9 w-9 text-slate-200 mx-auto" /><p className="mt-3 text-sm text-slate-500">Nenhum arquivo encontrado.</p><p className="mt-1 text-xs text-slate-400">Os arquivos enviados para casos e pacientes aparecerão aqui automaticamente.</p></div>
          )}
          {files.isLoading && <div className="px-6 py-12 text-center text-sm text-slate-400">Carregando arquivos…</div>}
        </div>
      </section>
    </div>
  );
}
