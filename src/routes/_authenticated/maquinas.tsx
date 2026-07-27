import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Wrench, Cog, Drill } from "lucide-react";

export const Route = createFileRoute("/_authenticated/maquinas")({
  component: MaquinasPage,
});

function MaquinasPage() {
  return (
    <div className="max-w-[1600px] mx-auto w-full px-6 md:px-16 py-8 md:py-10">
      <div className="flex items-center gap-3 mb-8">
        <Wrench className="h-7 w-7 text-primary stroke-[1.5px]" />
        <h1 className="text-3xl md:text-4xl font-light text-slate-900 tracking-tight">Maquinário</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/burrs"
          className="group bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all"
        >
          <div className="h-12 w-12 rounded-xl bg-primary/5 grid place-items-center text-primary mb-4 group-hover:bg-primary/10 transition-colors">
            <Drill className="h-5 w-5 stroke-[1.5px]" />
          </div>
          <h2 className="text-lg font-light text-slate-900 tracking-tight">Fresas / Brocas</h2>
          <p className="text-sm text-muted-foreground mt-1 font-light">
            Controle de uso, vida útil e suportes das fresas de zircônia e dissilicato.
          </p>
        </Link>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 opacity-60">
          <div className="h-12 w-12 rounded-xl bg-slate-50 grid place-items-center text-slate-400 mb-4">
            <Cog className="h-5 w-5 stroke-[1.5px]" />
          </div>
          <h2 className="text-lg font-light text-slate-900 tracking-tight">Equipamentos</h2>
          <p className="text-sm text-muted-foreground mt-1 font-light">
            Cadastro de fresadoras, scanners e impressoras (em breve).
          </p>
        </div>
      </div>
    </div>
  );
}
