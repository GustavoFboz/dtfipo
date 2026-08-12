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
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import type { Patient } from "@/lib/types";
import { normalizeText } from "@/lib/utils";
import { SkeletonCardGrid, SkeletonSwap, useListReveal } from "@/components/ui/skeleton-blocks";
import { FloatingLog } from "@/components/FloatingLog";



export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

function PatientsPage() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const patients = useQuery({ 
    queryKey: ["patients"], 
    queryFn: async () => {
      addLog("Iniciando busca de pacientes...");
      const data = await fetchPatients();
      addLog(`${data?.length || 0} pacientes carregados do banco`);
      return data;
    }
  });
  const reveal = useListReveal("patients-grid", patients.isPending && !patients.data);
  const [openNew, setOpenNew] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<string[]>(["Página de pacientes carregada", "Monitor de eventos pronto"]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => {
      const newLogs = [...prev, `${new Date().toLocaleTimeString()} - ${msg}`];
      return newLogs.slice(-50);
    });
  }, []);


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
    <div className="mx-auto w-full px-4 md:px-8 py-8 md:py-10">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">Pacientes</h1>
          <p className="text-slate-500 text-sm mt-1 font-light">Gerencie seu cadastro de pacientes</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button className="h-11 px-6 rounded-full gap-2 shadow-lg shadow-primary/20" onClick={() => setOpenNew(true)}>
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
      <div className="flex flex-col w-full">
        <div className="border-t border-slate-100 dark:border-white/5 w-full" />
        {filtered.map((p, i) => (
          <div
            key={p.id}
            style={reveal.itemProps(i).style}
            className={`${reveal.itemProps(i).className} cursor-pointer bg-transparent py-8 flex items-center gap-8 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all duration-300 group border-b border-slate-100 dark:border-white/5 w-full`}
            onClick={() => {
              addLog(`Acessando perfil do paciente: ${p.name} (ID: ${p.id.substring(0,8)}...)`);
              // Transição ultra premium com redirecionamento direto
              window.location.href = `/patients/${p.id}`;
            }}
          >
            <div className="h-14 w-14 rounded-full bg-slate-50 dark:bg-slate-800 grid place-items-center text-slate-400 shrink-0 overflow-hidden">
              {p.photo_url ? (
                <img src={p.photo_url} className="h-full w-full object-cover" alt="" />
              ) : (
                <User className="h-6 w-6 font-light" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-light text-slate-800 dark:text-slate-200 tracking-tight group-hover:text-primary transition-colors">{p.name}</div>
              <div className="text-[12px] text-slate-400 mt-1 truncate uppercase tracking-widest font-light">
                {[p.age ? `${p.age} anos` : null, p.cpf, p.phone, p.email].filter(Boolean).join(" · ") || "Sem dados de contato"}
              </div>
            </div>
            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity pr-4">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation();
                  setEditPatient(p); 
                }} 
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4 text-slate-400" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-full hover:bg-destructive/10 hover:text-destructive"
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
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-20 text-center text-slate-400 font-light border-b border-slate-100 dark:border-white/5">
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
      
      <FloatingLog title="Log de Navegação" logs={logs} />
    </div>
  );
}
