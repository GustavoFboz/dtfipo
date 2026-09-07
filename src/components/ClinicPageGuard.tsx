import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, LockKeyhole, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { fetchClinicContext, type ClinicPermission } from "@/lib/clinic";

export function ClinicPageGuard({ permission, children }: { permission: ClinicPermission; children: ReactNode }) {
  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext, staleTime: 60_000 });

  if (context.isLoading) {
    return <div className="grid min-h-[55vh] place-items-center text-sm text-slate-400">Validando acesso à Clínica…</div>;
  }

  if (context.isError) {
    return (
      <div className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><RefreshCw className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-light text-slate-900 dark:text-white">Não foi possível validar a Clínica</h1>
          <p className="mt-2 text-sm font-light leading-relaxed text-slate-500">O acesso não foi negado pelo plano. O DentalFlow apenas não conseguiu confirmar as permissões neste momento. Tente novamente ou aguarde a sincronização do aplicativo.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => context.refetch()}
              disabled={context.isFetching}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              <RefreshCw className={`h-4 w-4 ${context.isFetching ? "animate-spin" : ""}`} />
              Tentar novamente
            </button>
            <Link to="/hub" className="inline-flex rounded-full border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Voltar aos módulos</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!context.data?.hasClinicalModule) {
    return (
      <div className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1e8f87]/8 text-[#1e8f87]"><Building2 className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-light text-slate-900 dark:text-white">Módulo Clínica não disponível</h1>
          <p className="mt-2 text-sm font-light leading-relaxed text-slate-500">Esta conta ainda não possui o ambiente Clínica habilitado. Os demais módulos continuam funcionando de forma independente.</p>
          <Link to="/hub" className="mt-5 inline-flex rounded-full border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Voltar aos módulos</Link>
        </div>
      </div>
    );
  }

  if (!context.data.permissions[permission]) {
    return (
      <div className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5"><LockKeyhole className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-light text-slate-900 dark:text-white">Acesso restrito</h1>
          <p className="mt-2 text-sm font-light leading-relaxed text-slate-500">Seu perfil não possui permissão para esta área da Clínica. Um administrador pode alterar isso nas configurações clínicas.</p>
          <Link to="/clinica" className="mt-5 inline-flex rounded-full border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Voltar ao início da Clínica</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
