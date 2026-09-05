import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileArchive, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadVersionedSystemArchive } from "@/lib/system-export.functions";

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const chunkSize = 1024 * 1024;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const part = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(part.length);
    for (let i = 0; i < part.length; i++) bytes[i] = part.charCodeAt(i);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: contentType });
}

export function SystemExportCard() {
  const downloadFn = useServerFn(downloadVersionedSystemArchive);
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    const id = toast.loading("Preparando ZIP completo do sistema…");
    try {
      const result = await downloadFn();
      const blob = base64ToBlob(result.base64, result.contentType);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("Download do código iniciado", { id });
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível gerar o ZIP.", { id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.025] p-6 dark:bg-primary/[0.04]">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><FileArchive className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-sm font-medium text-slate-900 dark:text-white">Cópia completa do código</h2><ShieldCheck className="h-4 w-4 text-emerald-500" /></div>
            <p className="mt-1 max-w-2xl text-xs font-light leading-relaxed text-slate-500">Baixa em um único ZIP todos os arquivos versionados da branch principal: frontend, backend, migrations e assets. O acesso é revalidado no servidor exclusivamente para o proprietário.</p>
            <p className="mt-2 text-[11px] font-light text-amber-600/90 dark:text-amber-400/80">Banco de dados vivo e arquivos enviados ao Storage não fazem parte deste ZIP e exigem backup próprio do Lovable Cloud.</p>
          </div>
        </div>
        <Button onClick={handleDownload} disabled={busy} className="h-11 shrink-0 rounded-full px-5">
          <Download className="mr-2 h-4 w-4" /> {busy ? "Preparando…" : "Baixar sistema completo (.zip)"}
        </Button>
      </div>
    </div>
  );
}
