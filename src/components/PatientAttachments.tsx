import { useMemo, useRef, useState } from "react";
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

type Props = {
  patientId: string;
  kinds?: string[];
  title?: string;
  defaultKind?: string;
  emptyLabel?: string;
};

export function PatientAttachments({
  patientId,
  kinds,
  title = "Anexos clínicos",
  defaultKind = "scan",
  emptyLabel = "Nenhum anexo enviado ainda.",
}: Props) {
  const qc = useQueryClient();
  const att = useQuery({
    queryKey: ["patient_attachments", patientId],
    queryFn: () => fetchPatientAttachments(patientId),
  });
  const visible = useMemo(
    () => (att.data ?? []).filter((item) => !kinds?.length || kinds.includes(item.kind)),
    [att.data, kinds],
  );
  const allowedKindEntries = useMemo(
    () => Object.entries(KIND_LABEL).filter(([value]) => !kinds?.length || kinds.includes(value)),
    [kinds],
  );
  const initialKind = allowedKindEntries.some(([value]) => value === defaultKind)
    ? defaultKind
    : (allowedKindEntries[0]?.[0] ?? "other");

  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState(initialKind);
  const [toDelete, setToDelete] = useState<PatientAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Selecione ao menos um arquivo");
      for (const selected of files) {
        const baseTitle = uploadTitle.trim();
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
      setFiles([]); setUploadTitle(""); setDesc(""); setKind(initialKind);
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[#1e8f87]/8 text-[#1e8f87]">
            {kinds?.some((item) => ["photo", "xray", "scan"].includes(item)) ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div>
            <h2 className="text-base font-medium tracking-tight text-slate-900 dark:text-white">{title}</h2>
            <div className="mt-0.5 text-[10px] font-light text-slate-400">{visible.length} {visible.length === 1 ? "arquivo" : "arquivos"}</div>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) setKind(initialKind); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 rounded-full bg-[#1e8f87] px-4 text-white hover:bg-[#177a73]"><Upload className="mr-2 h-3.5 w-3.5" /> Enviar arquivo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo anexo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedKindEntries.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Título</Label><Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Ex.: Panorâmica inicial" /></div>
              <div><Label>Descrição (opcional)</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
              <div>
                <Label>Arquivo</Label>
                <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> {files.length ? "Trocar" : "Selecionar"}</Button>
                  {files.length > 0 && <span className="truncate text-sm text-muted-foreground">{files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`}</span>}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => upload.mutate()} disabled={upload.isPending || files.length === 0}>{files.length > 1 ? "Enviar arquivos" : "Enviar"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-200/80 bg-slate-50/35 py-10 text-center text-xs font-light text-slate-400 dark:border-white/10 dark:bg-white/[0.015]">{emptyLabel}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-[22px] border border-slate-200/70 bg-white transition hover:border-[#1e8f87]/20 hover:shadow-[0_16px_38px_-32px_rgba(15,23,42,.55)] dark:border-white/10 dark:bg-slate-950">
              <div className="aspect-[4/3] bg-slate-50 grid place-items-center overflow-hidden dark:bg-white/[0.03]">
                {a.thumbnail_url ? <img src={a.thumbnail_url} alt={a.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <FileText className="h-8 w-8 text-slate-200" />}
              </div>
              <div className="p-3.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#1e8f87]">{KIND_LABEL[a.kind] ?? a.kind}</div>
                <div className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-white" title={a.title}>{a.title}</div>
                {a.description && <div className="mt-1 line-clamp-2 text-[10px] font-light leading-4 text-slate-400">{a.description}</div>}
                <div className="mt-3 flex items-center gap-1.5">
                  <a href={a.file_url} target="_blank" rel="noreferrer" className="flex-1"><Button size="sm" variant="outline" className="h-8 w-full rounded-xl border-slate-200 text-[10px]"><Download className="mr-1.5 h-3.5 w-3.5" /> Abrir</Button></a>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" onClick={() => setToDelete(a)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5 text-slate-300 transition hover:text-destructive" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir anexo?</AlertDialogTitle><AlertDialogDescription>O arquivo <b>{toDelete?.title}</b> será removido permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => toDelete && remove.mutate(toDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
