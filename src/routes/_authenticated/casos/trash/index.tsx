import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  Trash2, 
  RefreshCcw, 
  Search, 
  Calendar, 
  User, 
  History,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonBlock, SkeletonCircle } from "@/components/ui/skeleton-blocks";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/casos/trash/")({
  component: TrashPage,
});

function TrashPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: deletedCases, isLoading } = useQuery({
    queryKey: ["cases", "deleted"],
    queryFn: async () => {
      // No schema real, talvez não exista um campo 'deleted_at'. 
      // Mas o usuário pediu uma página para casos excluídos/cancelados.
      // Vamos buscar casos com status 'cancelado' ou 'arquivado' se não houver soft delete real.
      // Entretanto, como ele mencionou "casos excluídos", idealmente deveriam ser casos com status 'cancelado'.
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          patient:patients(name),
          doctor:doctors(name),
          cadista:cadistas(name)
        `)
        .eq("status", "cancelado")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const restoreCase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cases")
        .update({ status: "em_andamento", finished: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caso restaurado com sucesso");
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (e: any) => toast.error("Erro ao restaurar: " + e.message),
  });

  const filtered = deletedCases?.filter(c => 
    c.patient?.name?.toLowerCase().includes(search.toLowerCase()) ||
    String(c.case_number ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="h-full max-w-[1200px] mx-auto w-full px-6 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            Gerencie casos que foram cancelados ou removidos do fluxo principal de trabalho.
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

      <div className="bg-white dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
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
              <h3 className="text-xl font-light text-slate-900 dark:text-slate-100">Nenhum caso encontrado</h3>
              <p className="text-slate-500 font-light max-w-xs mx-auto">
                {search ? "Tente buscar por outro termo ou limpe o filtro." : "A lixeira está vazia. Casos cancelados aparecerão aqui."}
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
                        Excluído em {c.updated_at ? format(new Date(c.updated_at), "dd 'de' MMM, HH:mm", { locale: ptBR }) : "N/A"}
                      </span>
                      {c.doctor?.name && (
                        <span className="flex items-center gap-1.5 border-l border-slate-200 dark:border-white/10 pl-4">
                          Dr. {c.doctor.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => restoreCase.mutate(c.id)}
                    disabled={restoreCase.isPending}
                    className="h-10 px-4 rounded-full text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 gap-2 font-normal"
                  >
                    <RefreshCcw className={`h-4 w-4 ${restoreCase.isPending ? "animate-spin" : ""}`} />
                    Restaurar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 p-6 rounded-3xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-700/80 dark:text-amber-500/80 leading-relaxed font-light">
          Casos cancelados ou arquivados são mantidos nesta área para histórico. Restaurar um caso o devolverá ao status "Em andamento" e o tornará visível no controle principal novamente.
        </p>
      </div>
    </div>
  );
}
