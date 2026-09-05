import { createFileRoute } from "@tanstack/react-router";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { EquipeManagement } from "@/components/EquipeManagement";

export const Route = createFileRoute("/_authenticated/clinica/equipe")({ component: ClinicTeamPage });

function ClinicTeamPage() {
  return (
    <ClinicPageGuard permission="clinical.team">
      <div className="mx-auto max-w-[1500px] px-6 py-10 md:px-12">
        <div className="mb-7">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Clínica</div>
          <h1 className="mt-2 text-4xl font-extralight tracking-tight text-slate-950 dark:text-white">Equipe e acessos</h1>
          <p className="mt-2 text-sm font-light text-slate-500">Gerencie os profissionais da organização. As permissões específicas da Clínica ficam em Configurações da Clínica.</p>
        </div>
        <EquipeManagement />
      </div>
    </ClinicPageGuard>
  );
}
