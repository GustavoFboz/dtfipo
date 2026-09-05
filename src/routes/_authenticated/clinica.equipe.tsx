import { createFileRoute } from "@tanstack/react-router";
import { Users2 } from "lucide-react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { EquipeManagement } from "@/components/EquipeManagement";

export const Route = createFileRoute("/_authenticated/clinica/equipe")({ component: ClinicTeamPage });

function ClinicTeamPage() {
  return (
    <ClinicPageGuard permission="clinical.team">
      <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 lg:px-12">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Acessos clínicos</div>
            <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Equipe</h1>
            <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">Profissionais do consultório, solicitações de acesso e administração de membros em um único lugar.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[#1e8f87]/7 px-4 py-2 text-xs font-medium text-[#1e8f87]"><Users2 className="h-4 w-4" /> Ambiente Clínica</div>
        </div>
        <EquipeManagement mode="clinic" />
      </div>
    </ClinicPageGuard>
  );
}
