import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { generateBackup, getBackupStatus } from "@/lib/backup.functions";
import { cn } from "@/lib/utils";

type Status = "fresh" | "stale" | "outdated" | "changed" | "never";

function computeStatus(last: { created_at: string; schema_hash: string } | null | undefined, currentHash: string): Status {
  if (!last) return "never";
  if (last.schema_hash !== currentHash) return "changed";
  const ageMs = Date.now() - new Date(last.created_at).getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days > 7) return "outdated";
  if (days > 1) return "stale";
  return "fresh";
}

const STATUS_META: Record<Status, { color: string; ring: string; label: string; Icon: typeof CheckCircle2 }> = {
  fresh:    { color: "bg-emerald-500", ring: "ring-emerald-500/30",  label: "Backup em dia",                   Icon: CheckCircle2 },
  stale:    { color: "bg-amber-500",   ring: "ring-amber-500/30",    label: "Backup com mais de 1 dia",        Icon: AlertTriangle },
  outdated: { color: "bg-red-500",     ring: "ring-red-500/40 animate-pulse", label: "Backup com mais de 7 dias", Icon: AlertCircle },
  changed:  { color: "bg-red-500",     ring: "ring-red-500/40 animate-pulse", label: "Schema alterado desde o último backup", Icon: AlertCircle },
  never:    { color: "bg-red-500",     ring: "ring-red-500/40 animate-pulse", label: "Nenhum backup registrado", Icon: AlertCircle },
};

export function BackupButton() {
  const getStatus = useServerFn(getBackupStatus);
  const doBackup = useServerFn(generateBackup);
  const [running, setRunning] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["backend-backup-status"],
    queryFn: () => getStatus(),
    refetchInterval: 60_000,
  });

  const status: Status = computeStatus(data?.last as never, data?.currentHash ?? "");
  const meta = STATUS_META[status];

  async function handleClick() {
    if (running) return;
    setRunning(true);
    const t = toast.loading("Gerando backup do backend...");
    try {
      const { sql, hash } = await doBackup();
      const blob = new Blob([sql], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `dentalflow-backup-${ts}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup gerado", { id: t, description: `Hash ${hash.slice(0, 8)} · ${(blob.size / 1024).toFixed(1)} KB` });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Falha ao gerar backup", { id: t, description: msg });
    } finally {
      setRunning(false);
    }
  }

  const Icon = meta.Icon;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={running}
      title={meta.label + " · clique para gerar novo backup"}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-lg ring-2 transition hover:shadow-xl hover:scale-105 disabled:opacity-70 disabled:hover:scale-100",
        meta.ring,
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className={cn("absolute inset-0 rounded-full", meta.color)} />
        {(status === "changed" || status === "outdated" || status === "never") && (
          <span className={cn("absolute inset-0 rounded-full opacity-60 animate-ping", meta.color)} />
        )}
      </span>
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
      <span className="hidden sm:inline">Backup Backend</span>
      <Icon className="h-4 w-4 opacity-70" />
    </button>
  );
}