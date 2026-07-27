import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { fetchCaseAttachmentText } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storagePath: string;
  fileName: string;
};

export function ExocadViewer({ open, onOpenChange, storagePath, fileName }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setHtml(null); setErr(null); return; }
    let cancelled = false;
    fetchCaseAttachmentText(storagePath)
      .then((t) => { if (!cancelled) setHtml(t); })
      .catch((e) => { if (!cancelled) setErr((e as Error).message); });
    return () => { cancelled = true; };
  }, [open, storagePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-3 border-b border-border">
          <DialogTitle className="text-base font-medium truncate">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30">
          {err ? (
            <div className="p-6 text-sm text-destructive">Erro ao carregar: {err}</div>
          ) : !html ? (
            <div className="h-full flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando visualização…
            </div>
          ) : (
            <iframe
              title={fileName}
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              referrerPolicy="no-referrer"
              className="w-full h-full bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
