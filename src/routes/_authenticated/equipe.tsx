import { createFileRoute } from "@tanstack/react-router";
import { EquipeManagement } from "@/components/EquipeManagement";
import { Users2, UserPlus, ShieldCheck, UserCheck } from "lucide-react";
import { AddTeamMemberDialog } from "@/components/AddTeamMemberDialog";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: EquipePage,
});

function EquipePage() {
  return (
    <div className="p-6 md:p-12 pb-24 font-light">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-16">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-bold text-primary uppercase tracking-[0.08em]">
            <UserCheck className="h-3 w-3" />
            Recursos Humanos
          </div>
          <h1 className="text-5xl md:text-6xl font-light text-slate-900 dark:text-slate-100 leading-[1] tracking-[-0.05em]">
            Gestão de <span className="text-primary opacity-90">Equipe</span>
          </h1>
          <p className="text-slate-400 font-light text-lg max-w-xl border-l border-slate-100 dark:border-slate-800 pl-6">
            Controle de acessos, papéis e colaboradores ativos no ecossistema do laboratório.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-5 items-center self-start lg:self-end">
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] shadow-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
            Time Ativo
          </div>
          <AddTeamMemberDialog />
        </div>
      </header>

      <EquipeManagement />
    </div>
  );
}
