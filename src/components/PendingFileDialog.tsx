import { Loader2, CloudUpload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Diálogo com a identidade visual do sistema, exibido quando o usuário tenta
 * abrir/baixar um arquivo que ainda está sendo enviado ao servidor.
 */
export function PendingFileDialog({
  open,
  fileName,
  onOpenChange,
}: {
  open: boolean;
  fileName?: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <div className="mx-auto mb-2 relative h-16 w-16">
            <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
            <span className="absolute inset-0 rounded-full bg-primary/10" />
            <span className="absolute inset-0 grid place-items-center text-primary">
              <CloudUpload className="h-7 w-7" />
            </span>
          </div>
          <DialogTitle className="text-center text-base">Arquivo ainda em envio</DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed">
            {fileName ? (
              <>
                <span className="font-medium text-foreground break-all">{fileName}</span> ainda está sendo
                carregado no sistema.
              </>
            ) : (
              <>Este arquivo ainda está sendo carregado no sistema.</>
            )}
            <br />
            Aguarde a conclusão do envio para abrir ou baixar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Enviando... você pode continuar usando o sistema.
        </div>
        <DialogFooter className="sm:justify-center">
          <Button type="button" onClick={() => onOpenChange(false)} className="min-w-32">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
