import { createFileRoute, Outlet, useMatch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchPatients, adminDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, User, Trash2, Pencil, Search, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import type { Patient } from "@/lib/types";
import { normalizeText } from "@/lib/utils";
import { SkeletonCardGrid, SkeletonSwap, useListReveal } from "@/components/ui/skeleton-blocks";
// FloatingLog removido
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsLayout,
});

function PatientsLayout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const match = useMatch({ from: "/_authenticated/patients/$id", shouldThrow: false });
  const isDetailOpen = !!match;

  const patients = useQuery({ 
    queryKey: ["patients"], 
    queryFn: async () => {
      const data = await fetchPatients();
      return data;
    }
  });

  const reveal = useListReveal("patients-grid", patients.isPending && !patients.data);
  const [openNew, setOpenNew] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = patients.data ?? [];
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
    <div className="relative min-h-screen w-full bg-white dark:bg-[#0A0E17]">
      <div className="mx-auto w-full px-6 md:px-12 py-12 max-w-[1400px]">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-light text-slate-900 dark:text-white tracking-tight">Pacientes</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-light">Gerencie seu cadastro de pacientes</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="relative group hidden sm:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Pesquisar..." 
                className="pl-11 h-11 w-64 rounded-full border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus-visible:ring-primary/20 transition-all"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button className="h-12 px-8 rounded-full gap-2 shadow-[0_8px_20px_-4px_rgba(59,130,246,0.3)] bg-primary hover:bg-primary/90 transition-all active:scale-95 text-sm font-medium" onClick={() => setOpenNew(true)}>
              <Plus className="h-5 w-5" /> Novo paciente
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
          <div className="flex flex-col w-full bg-white dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group relative cursor-pointer py-7 px-10 flex items-center gap-8 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all border-b border-slate-100 dark:border-white/5 last:border-0"
                onClick={() => {
                  navigate({ to: "/patients/$id", params: { id: p.id } });
                }}
              >
                <div className="h-16 w-16 rounded-full bg-slate-50 dark:bg-white/5 grid place-items-center text-slate-300 shrink-0 overflow-hidden border border-slate-100 dark:border-white/5">
                  {p.photo_url ? (
                    <img src={p.photo_url} className="h-full w-full object-cover" alt="" />
                  ) : (
                    <User className="h-8 w-8 font-light" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-2xl font-light text-slate-800 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                    {p.name}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-1 uppercase tracking-[0.1em] font-medium">
                    {p.phone || "SEM DADOS DE CONTATO"}
                  </div>
                </div>

                <div className="flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-all">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"
                    onClick={(e) => { 
                      e.preventDefault(); 
                      e.stopPropagation();
                      setEditPatient(p); 
                    }} 
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
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <div className="py-24 text-center text-slate-400 font-light italic">
                Nenhum paciente encontrado.
              </div>
            )}
          </div>
        </SkeletonSwap>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é definitiva. O paciente <b>{toDelete?.name}</b> será removido permanentemente.
              Pacientes com casos vinculados não poderão ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet />
      
      {/* O log flutuante foi removido a pedido do usuário */}
    </div>
  );
}
