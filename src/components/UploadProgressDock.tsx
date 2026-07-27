import { useSyncExternalStore, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadManager, type UploadTask } from "@/lib/upload-manager";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, FolderArchive, FileUp, RotateCw } from "lucide-react";

const EMPTY_UPLOAD_TASKS: UploadTask[] = [];

function useUploadTasks(): UploadTask[] {
  return useSyncExternalStore(
    (l) => uploadManager.subscribe(l),
    () => uploadManager.getSnapshot(),
    () => EMPTY_UPLOAD_TASKS,
  );
}

export function UploadProgressDock() {
  const tasks = useUploadTasks();
  const [collapsed, setCollapsed] = useState(false);
  const qc = useQueryClient();

  if (tasks.length === 0) return null;
  const active = tasks.filter((t) => t.status === "zipping" || t.status === "uploading" || t.status === "queued").length;
  const failed = tasks.filter((t) => t.status === "error" && uploadManager.canRetry(t.id)).length;

  return (
    <div
      data-upload-dock=""
      className="pointer-events-auto fixed bottom-4 right-4 z-[100] w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
        <div className="text-sm font-semibold flex items-center gap-2">
          {active > 0 ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          Uploads {active > 0 ? `(${active} em andamento)` : "concluídos"}
        </div>
        <div className="flex items-center gap-1">
          {failed > 0 && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1" onClick={() => uploadManager.retryAllFailed()}>
              <RotateCw className="h-3 w-3" /> Tentar novamente ({failed})
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {active === 0 && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { uploadManager.clearFinished(); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {!collapsed && (
        <ul className="max-h-[50vh] overflow-y-auto divide-y">
          {tasks.map((t) => (
            <li key={t.id} className="px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                {t.isFolder ? <FolderArchive className="h-3.5 w-3.5 text-primary shrink-0" /> : <FileUp className="h-3.5 w-3.5 text-primary shrink-0" />}
                <span className="font-medium truncate flex-1" title={t.label}>{t.label}</span>
                {t.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                {t.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                {(t.status === "zipping" || t.status === "uploading") && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                {t.status === "error" && uploadManager.canRetry(t.id) && (
                  <button
                    aria-label="Tentar novamente"
                    className="text-primary hover:opacity-80"
                    onClick={() => uploadManager.retry(t.id)}
                  >
                    <RotateCw className="h-3 w-3" />
                  </button>
                )}
                {(t.status === "success" || t.status === "error") && (
                  <button
                    aria-label="Remover"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      uploadManager.remove(t.id);
                      if (t.status === "success") {
                        qc.invalidateQueries({ queryKey: ["case_attachments", t.caseId] });
                        qc.invalidateQueries({ queryKey: ["case_activity", t.caseId] });
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {(t.status === "zipping" || t.status === "uploading") && <Progress value={t.progress} className="h-1.5" />}
              <div className={`text-[10.5px] ${t.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {t.message ?? t.status}
                {t.isFolder && t.fileCount > 0 && ` · ${t.fileCount} arquivos`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
