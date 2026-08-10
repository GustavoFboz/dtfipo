import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  Trash2, 
  RefreshCcw, 
  Search, 
  Calendar, 
  User, 
  History,
  AlertCircle,
  ShieldAlert,
  Ghost,
  Clock,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonBlock, SkeletonCircle } from "@/components/ui/skeleton-blocks";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fetchCases, restoreCase, permanentDeleteCase } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { motion, AnimatePresence } from "framer-motion";


export const Route = createFileRoute("/_authenticated/casos/trash/")({
  component: TrashPage,
});

function TrashPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: deletedCases = [], isLoading } = useQuery({
    queryKey: ["cases", "deleted"],
    queryFn: () => fetchCases("deleted"),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreCase(id),
    onSuccess: () => {
      toast.success("Caso restaurado com sucesso");
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (e: any) => toast.error("Erro ao restaurar: " + e.message),
  });

  const permanentDelete = useMutation({
    mutationFn: (id: string) => permanentDeleteCase(id),
    onSuccess: () => {
      toast.success("Caso excluído permanentemente");
      qc.invalidateQueries({ queryKey: ["cases"] });
      setDeletingId(null);
    },
    onError: (e: any) => toast.error("Erro ao excluir: " + e.message),
  });

  const filtered = deletedCases.filter(c => 
    c.patient?.name?.toLowerCase().includes(search.toLowerCase()) ||
    String(c.case_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-black font-light">
      <div className="max-w-[1200px] mx-auto w-full px-6 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <button 
              onClick={() => navigate({ to: "/casos" })}
              className="group flex items-center gap-2 text-slate-400 hover:text-primary transition-colors mb-4"
            >
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              <span className="text-sm font-medium">Voltar para Controle de Casos</span>
            </button>
            <h1 className="text-4xl font-extralight tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-4">
              <Trash2 className="h-10 w-10 text-slate-300 stroke-[1.5px]" />
              Lixeira e Cancelados
            </h1>
            <p className="text-slate-500 font-light max-w-md">
              Itens nesta pasta serão excluídos definitivamente após 30 dias.
            </p>
          </div>

          <div className="relative w-full md:w-72 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder="Buscar por paciente ou nº..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pl-11 rounded-2xl bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary/20"
            />
          </div>
        </header>

        <div className="bg-white dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden min-h-[400px]">
          {isLoading ? (
            <div className="p-8 space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-6">
                  <SkeletonCircle className="h-12 w-12 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-1/4" />
                    <SkeletonBlock className="h-3 w-1/3" />
                  </div>
                  <SkeletonBlock className="h-10 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 px-6 text-center space-y-4">
              <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                <History className="h-10 w-10 text-slate-300" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-light text-slate-900 dark:text-slate-100">Nenhum caso na lixeira</h3>
                <p className="text-slate-500 font-light max-w-xs mx-auto">
                  {search ? "Tente buscar por outro termo ou limpe o filtro." : "A lixeira está vazia."}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-white/5">
              {filtered.map((c) => (
                <div key={c.id} className="group p-6 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex items-start gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                      <User className="h-6 w-6 text-slate-400" />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {c.patient?.name || "Paciente sem nome"}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 uppercase tracking-wider shrink-0">
                          #{c.case_number || "---"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-light">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Removido em {c.updated_at ? format(new Date(c.updated_at), "dd 'de' MMM, HH:mm", { locale: ptBR }) : "N/A"}
                        </span>
                        {c.doctor?.name && (
                          <span className="flex items-center gap-1.5 border-l border-slate-200 dark:border-white/10 pl-4">
                            Dr. {c.doctor.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => restore.mutate(c.id)}
                      disabled={restore.isPending}
                      className="h-10 px-4 rounded-full text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 gap-2 font-normal"
                    >
                      <RefreshCcw className={`h-4 w-4 ${restore.isPending ? "animate-spin" : ""}`} />
                      Restaurar
                    </Button>
                    
                    <AlertDialog open={deletingId === c.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setDeletingId(c.id)}
                          className="h-10 w-10 rounded-full text-slate-300 hover:text-destructive hover:bg-destructive/5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2rem] border-slate-100 dark:border-white/5">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-5 w-5" />
                            Excluir permanentemente?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O caso de <strong>{c.patient?.name}</strong> será removido para sempre do banco de dados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => permanentDelete.mutate(c.id)}
                            className="bg-destructive hover:bg-destructive/90 rounded-full"
                          >
                            Excluir para sempre
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-6 rounded-3xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700/80 dark:text-amber-500/80 leading-relaxed font-light">
            <strong>Política de Retenção:</strong> Os casos na lixeira são mantidos por 30 dias para possibilitar a restauração. Após esse período, o sistema realiza a limpeza automática e definitiva dos dados.
          </p>
        </div>
      </div>
    </div>
  );
}
