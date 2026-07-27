import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPatientAttachments, uploadPatientAttachment, deletePatientAttachment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, FileText, ImageIcon, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import type { PatientAttachment } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  scan: "Escaneamento",
  xray: "Raio-X",
  photo: "Foto clínica",
  document: "Documento",
  other: "Outro",
};

export function PatientAttachments({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const att = useQuery({
    queryKey: ["patient_attachments", patientId],
    queryFn: () => fetchPatientAttachments(patientId),
  });
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState("scan");
  const [toDelete, setToDelete] = useState<PatientAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Selecione ao menos um arquivo");
      for (const selected of files) {
        const baseTitle = title.trim();
        await uploadPatientAttachment(patientId, selected, {
          title: files.length === 1 ? (baseTitle || selected.name) : (baseTitle ? `${baseTitle} — ${selected.name}` : selected.name),
          description: desc || null,
          kind,
        });
      }
    },
    onSuccess: () => {
      toast.success(files.length === 1 ? "Arquivo enviado" : `${files.length} arquivos enviados`);
      qc.invalidateQueries({ queryKey: ["patient_attachments", patientId] });
      setOpen(false);
      setFiles([]); setTitle(""); setDesc(""); setKind("scan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (a: PatientAttachment) => deletePatientAttachment(a),
    onSuccess: () => {
      toast.success("Arquivo removido");
      qc.invalidateQueries({ queryKey: ["patient_attachments", patientId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Anexos clínicos
          <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {att.data?.length ?? 0}
          </span>
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Upload className="h-4 w-4" /> Enviar arquivo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo anexo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Escaneamento inicial" /></div>
              <div><Label>Descrição (opcional)</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
              <div>
                <Label>Arquivo</Label>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
                    <Upload className="h-4 w-4" /> {files.length ? "Trocar" : "Selecionar"}
                  </Button>
                  {files.length > 0 && <span className="text-sm text-muted-foreground truncate">{files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`}</span>}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => upload.mutate()} disabled={upload.isPending || files.length === 0}>
                {files.length > 1 ? "Enviar arquivos" : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {att.data?.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed py-8 text-center text-muted-foreground text-sm">
          Nenhum anexo enviado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {att.data?.map((a) => (
            <div key={a.id} className="bg-card rounded-2xl border border-border/60 overflow-hidden flex flex-col">
              <div className="aspect-square bg-muted grid place-items-center overflow-hidden">
                {a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt={a.title} className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="text-xs font-bold text-primary uppercase tracking-wide">{KIND_LABEL[a.kind] ?? a.kind}</div>
                <div className="font-semibold text-sm truncate" title={a.title}>{a.title}</div>
                {a.description && <div className="text-xs text-muted-foreground line-clamp-2">{a.description}</div>}
                <div className="flex items-center gap-1 mt-auto pt-2">
                  <a href={a.file_url} target="_blank" rel="noreferrer" className="flex-1">
                    <Button size="sm" variant="outline" className="w-full gap-1.5">
                      <Download className="h-3.5 w-3.5" /> Abrir
                    </Button>
                  </a>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(a)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo <b>{toDelete?.title}</b> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate(toDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImageIcon className="hidden" />
    </section>
  );
}
