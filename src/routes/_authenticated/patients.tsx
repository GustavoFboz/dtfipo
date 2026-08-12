import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchPatients, adminDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, User, Trash2, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import type { Patient } from "@/lib/types";
import { normalizeText } from "@/lib/utils";
import { SkeletonCardGrid, SkeletonSwap, useListReveal } from "@/components/ui/skeleton-blocks";


export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

function PatientsPage() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const reveal = useListReveal("patients-grid", patients.isPending && !patients.data);
  const [openNew, setOpenNew] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = patients.data ?? [];
    
    // Sort alphabetically by name by default
    list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    if (!q.trim()) return list;
    const s = normalizeText(q);
    return list.filter((p) =>
      normalizeText([p.name, p.first_name, p.last_name, p.cpf, p.phone, p.email].filter(Boolean).join(" ")).includes(s),
    );
  }, [patients.data, q]);

  const remove = useMutation({
    mutationFn: (id: string) => adminDelete("patients", id),
    onMutate: (id: string) => {
      setToDelete(null);
      const prev = qc.getQueryData<Patient[]>(["patients"]);
      qc.setQueryData<Patient[]>(["patients"], (old) => (Array.isArray(old) ? old.filter((p) => p.id !== id) : old));
      return { prev };
    },
    onError: (e: Error, _id, ctx: any) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["patients"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });


  return (
    <div className="max-w-[1600px] mx-auto w-full px-6 md:px-16 py-8 md:py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">Pacientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie seu cadastro de pacientes</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button className="h-11 px-6 rounded-xl gap-2 shadow-lg shadow-primary/20" onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" /> Novo paciente
          </Button>
        </div>
      </div>

      <PatientFormDialog open={openNew} onOpenChange={setOpenNew} />
      {editPatient && (
        <PatientFormDialog
          patient={editPatient}
          open={!!editPatient}
          onOpenChange={(o) => !o && setEditPatient(null)}
        />
      )}

      <SkeletonSwap
        loading={patients.isPending && !patients.data}
        animateContent={false}
        skeleton={<SkeletonCardGrid count={9} />}
      >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

        {filtered.map((p, i) => (
          <Link
            key={p.id}
            to="/patients/$id"
            params={{ id: p.id }}
            style={reveal.itemProps(i).style}
            className={`${reveal.itemProps(i).className} cursor-pointer bg-card rounded-2xl border border-border/60 p-4 flex items-center gap-4 hover:shadow-[var(--shadow-card)] hover:border-primary/40 transition-all duration-300 group no-underline text-inherit`}
          >
            <div className="h-12 w-12 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0 overflow-hidden">
              {p.photo_url ? (
                <img src={p.photo_url} className="h-full w-full object-cover" alt="" />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 tracking-tight group-hover:text-primary transition-colors">{p.name}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate uppercase tracking-wider font-semibold">
                {[p.age ? `${p.age}a` : null, p.cpf, p.phone].filter(Boolean).join(" · ") || "Sem dados"}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8"
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation();
                  setEditPatient(p); 
                }} 
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 hover:text-destructive"
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation();
                  setToDelete({ id: p.id, name: p.name }); 
                }}
                aria-label="Excluir paciente"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full bg-card rounded-2xl border border-dashed py-10 text-center text-muted-foreground">
            Nenhum paciente encontrado.
          </div>
        )}
      </div>
      </SkeletonSwap>


      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é definitiva. O paciente <b>{toDelete?.name}</b> será removido permanentemente.
              Pacientes com casos vinculados não poderão ser excluídos — finalize ou exclua os casos primeiro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
