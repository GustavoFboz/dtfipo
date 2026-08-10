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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-[#FDFDFF] dark:bg-[#0A0A0B] font-light selection:bg-rose-100 selection:text-rose-900"
    >
      <div className="max-w-[1200px] mx-auto w-full px-6 py-12 md:py-20 space-y-12">
        {/* Header Section with Neumorphic touches */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div className="space-y-6">
            <button 
              onClick={() => navigate({ to: "/casos" })}
              className="group flex items-center gap-2.5 text-slate-400 hover:text-primary transition-all duration-300"
            >
              <div className="p-2 rounded-full bg-slate-100/50 dark:bg-white/5 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              </div>
              <span className="text-sm font-medium tracking-tight">Voltar ao fluxo</span>
            </button>
            
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-white/5">
                  <Ghost className="h-8 w-8 text-rose-400/80 stroke-[1.5px]" />
                </div>
                <h1 className="text-5xl font-extralight tracking-tight text-slate-900 dark:text-slate-100 italic">
                  Lixeira
                </h1>
              </div>
              <p className="text-slate-400 font-light max-w-sm text-lg leading-relaxed">
                Repositório de casos cancelados. <span className="text-rose-400/70 font-normal">Limpamos tudo a cada 30 dias.</span>
              </p>
            </div>
          </div>

          <div className="relative group max-w-sm w-full">
            <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder="Localizar registro..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-14 pl-12 pr-6 rounded-[2rem] bg-white dark:bg-slate-900/50 border-slate-100 dark:border-white/5 shadow-inner-sm transition-all focus-visible:ring-2 focus-visible:ring-primary/10 text-base"
            />
          </div>
        </header>

        {/* Content Area */}
        <div className="relative">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 rounded-[2rem] bg-white dark:bg-slate-900/40 border border-slate-50 dark:border-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-40 text-center space-y-6"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-slate-100 dark:bg-white/5 blur-3xl rounded-full scale-150" />
                    <History className="h-16 w-16 text-slate-200 dark:text-white/10 relative" />
                  </div>
                  <div className="space-y-2 relative">
                    <h3 className="text-2xl font-light text-slate-400 italic">O vazio prevalece</h3>
                    <p className="text-slate-300 dark:text-white/5 font-light">Nenhum rastro encontrado por aqui.</p>
                  </div>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map((c, idx) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.05 }}
                      key={c.id} 
                      className="group relative overflow-hidden bg-white dark:bg-[#111113] rounded-[2.5rem] border border-slate-100 dark:border-white/5 hover:border-primary/20 dark:hover:border-primary/20 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none"
                    >
                      <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                          <div className="relative shrink-0">
                            <div className="h-16 w-16 rounded-[1.75rem] bg-slate-50 dark:bg-white/5 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                              <User className="h-8 w-8 text-slate-300 group-hover:text-primary/40 transition-colors" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-rose-500 border-4 border-white dark:border-[#111113] flex items-center justify-center shadow-lg">
                              <Trash2 className="h-2.5 w-2.5 text-white" />
                            </div>
                          </div>

                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-3">
                              <h4 className="text-xl font-light text-slate-900 dark:text-slate-100 tracking-tight truncate">
                                {c.patient?.name || "Paciente Anônimo"}
                              </h4>
                              <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                CASE {c.case_number || "---"}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-[13px] text-slate-400 font-light">
                              <span className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5 opacity-50" />
                                {c.updated_at ? format(new Date(c.updated_at), "dd 'de' MMMM", { locale: ptBR }) : "---"}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-white/10" />
                              <span className="italic">Dr. {c.doctor?.name || "---"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 md:pl-8 border-t md:border-t-0 md:border-l border-slate-50 dark:border-white/5 pt-6 md:pt-0">
                          <Button 
                            variant="ghost" 
                            onClick={() => restore.mutate(c.id)}
                            disabled={restore.isPending}
                            className="h-12 px-6 rounded-full text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 gap-2 font-medium transition-all group/btn"
                          >
                            <RefreshCcw className={`h-4 w-4 transition-transform group-hover/btn:rotate-180 duration-700 ${restore.isPending ? "animate-spin" : ""}`} />
                            Resgatar
                          </Button>
                          
                          <AlertDialog open={deletingId === c.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setDeletingId(c.id)}
                                className="h-12 w-12 rounded-full text-slate-200 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/5 transition-all"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-[3rem] border-slate-100 dark:border-white/5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-10">
                              <AlertDialogHeader className="space-y-4">
                                <div className="h-16 w-16 rounded-[2rem] bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mx-auto mb-2">
                                  <ShieldAlert className="h-8 w-8 text-rose-500" />
                                </div>
                                <AlertDialogTitle className="text-2xl font-light text-center tracking-tight">
                                  Exclusão Irreversível
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-center text-base leading-relaxed font-light text-slate-500">
                                  Você está prestes a remover o caso de <strong className="font-medium text-slate-900 dark:text-white">{c.patient?.name}</strong> permanentemente. Esta ação rompe todos os vínculos com o banco de dados.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="mt-8 sm:justify-center gap-3">
                                <AlertDialogCancel className="rounded-full h-12 px-8 border-slate-100 font-light hover:bg-slate-50 transition-all">Manter</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => permanentDelete.mutate(c.id)}
                                  className="bg-rose-500 hover:bg-rose-600 text-white rounded-full h-12 px-8 shadow-xl shadow-rose-200 dark:shadow-none border-none"
                                >
                                  Excluir Definitivamente
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer Info */}
        <footer className="pt-12 border-t border-slate-100 dark:border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-8 rounded-[3rem] bg-gradient-to-br from-slate-50/50 to-white dark:from-white/5 dark:to-transparent border border-white dark:border-white/5">
            <div className="flex items-center gap-5 max-w-lg">
              <div className="p-3 rounded-2xl bg-amber-100/50 dark:bg-amber-500/10 shrink-0">
                <AlertCircle className="h-6 w-6 text-amber-500/80" />
              </div>
              <div className="space-y-1">
                <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300">Custódia Temporal</h5>
                <p className="text-xs text-slate-400 leading-relaxed font-light">
                  Casos cancelados permanecem sob custódia por exatos 30 dias corridos. Após este marco, nosso protocolo de limpeza remove todos os dados sensíveis automaticamente.
                </p>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => navigate({ to: "/casos" })}
              className="rounded-full h-12 px-6 gap-2 border-slate-100 hover:bg-white dark:hover:bg-white/5 transition-all group"
            >
              <span className="font-light text-sm">Painel de Casos</span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </footer>
      </div>
    </motion.div>
  );
}
