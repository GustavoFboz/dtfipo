import { Link } from "@tanstack/react-router";
import { Users, Package, Settings, Users2, ShieldCheck, Database, Stethoscope } from "lucide-react";

const actions = [
  { to: "/patients", label: "Pacientes", icon: Users, color: "bg-white text-primary", shadow: "shadow-slate-100" },
  { to: "/estoque", label: "Estoque", icon: Package, color: "bg-white text-primary", shadow: "shadow-slate-100" },
  { to: "/equipe", label: "Equipe", icon: Users2, color: "bg-white text-primary", shadow: "shadow-slate-100" },
  { to: "/admin", label: "Ajustes", icon: Settings, color: "bg-white text-primary", shadow: "shadow-slate-100" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="group relative"
        >
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.01)] transition-all duration-700 group-hover:shadow-[0_30px_60px_rgba(0,0,0,0.03)] group-hover:-translate-y-1.5 flex flex-col items-center gap-6 overflow-hidden">
            <div className="relative z-10 p-5 rounded-2xl bg-primary/5 text-primary border border-primary/10 transition-all duration-1000 group-hover:scale-110 group-hover:bg-primary/10 group-hover:rotate-3">
              <action.icon className="h-6 w-6 stroke-[1.2px]" />
            </div>
            <span className="relative z-10 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.08em] transition-colors duration-500 group-hover:text-primary">
              {action.label}
            </span>
            
            {/* Subtle background decoration */}
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity duration-1000 rotate-12">
              <action.icon className="h-24 w-24" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

