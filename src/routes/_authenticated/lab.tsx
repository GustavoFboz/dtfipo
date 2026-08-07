import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { CasesTable } from "@/components/CasesTable";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { DashboardStats } from "@/components/DashboardStats";
import { MobileDashboard } from "@/components/MobileDashboard";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight, LayoutGrid, Building2, Stethoscope } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lab")({
  component: Index,
});

function Index() {
  const now = useNow();
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

  const ads = [
    { id: 1, url: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=800" },
    { id: 2, url: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&q=80&w=800" },
    { id: 3, url: "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&q=80&w=800" },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setAdIndex((prev) => (prev + 1) % ads.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [ads.length]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("dentalflow:lab-enter") === "1") {
        sessionStorage.removeItem("dentalflow:lab-enter");
        setEntering(true);
        const t = window.setTimeout(() => setEntering(false), 460);
        return () => window.clearTimeout(t);
      }
    } catch {}
  }, []);

  if (isMobile) return <MobileDashboard />;

  const dt = now
    ? `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} - ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : "";

  const openDentes = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      navigate({ to: "/dentes" });
    }, 320);
  };

  return (
    <div className={cn(
      "h-full flex flex-col font-light max-w-[1700px] mx-auto w-full px-10 pt-8 pb-10",
      exiting ? "animate-lab-exit" : entering ? "animate-lab-enter" : ""
    )}>
      <div className="flex gap-10 h-full min-h-0">
        {/* LADO ESQUERDO: CONTROLE DE CASOS */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div>
              <div className="flex items-center gap-3 text-[11px] font-bold text-[#2D7FF9]/70 uppercase tracking-[0.15em] mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                {dt}
              </div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Controle de Casos
              </h1>
            </div>

            <NewCaseDialog
              trigger={
                <Button className="h-12 px-6 rounded-xl bg-[#2D7FF9] hover:bg-[#2D7FF9]/90 text-white shadow-lg shadow-[#2D7FF9]/20 font-medium text-sm gap-2 transition-all hover:-translate-y-[1px]">
                  <Plus className="h-4 w-4 stroke-[2px]" /> Nova entrada
                </Button>
              }
            />
          </div>

          <div className="flex-1 min-h-0 bg-white dark:bg-black rounded-[32px] border border-slate-100 dark:border-white/5 overflow-hidden flex flex-col shadow-sm">
             <CasesTable hideToolbar minimal />
          </div>
        </div>

        {/* LADO DIREITO: PERFIL, ADS, ATALHOS */}
        <div className="w-[320px] flex flex-col gap-8 shrink-0">
          {/* BLOCO DE PERFIL */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-[32px] p-6 border border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl overflow-hidden bg-white dark:bg-black shadow-sm grid place-items-center border border-slate-100 dark:border-white/10">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-light text-[#2D7FF9]">{profile?.full_name?.[0] ?? "U"}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 font-light mb-0.5">Bem-vindo de volta,</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{profile?.full_name?.split(' ')[0]}</div>
              </div>
            </div>
          </div>

          {/* CARROSSEL DE ADS */}
          <div className="relative aspect-[4/8] bg-slate-50 dark:bg-slate-900/50 rounded-[32px] overflow-hidden border border-slate-100 dark:border-white/5">
            {ads.map((ad, i) => (
              <div 
                key={ad.id}
                className={cn(
                  "absolute inset-0 transition-all duration-700 ease-in-out",
                  i === adIndex ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
                )}
              >
                <img src={ad.url} alt="Publicidade" className="h-full w-full object-cover" />
              </div>
            ))}
            
            <div className="absolute bottom-6 inset-x-0 flex justify-center gap-2">
              {ads.map((_, i) => (
                <div 
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === adIndex ? "w-4 bg-[#2D7FF9]" : "w-1.5 bg-[#2D7FF9]/30"
                  )}
                />
              ))}
            </div>
          </div>

          {/* BOTÕES DE ATALHO */}
          <div className="grid grid-cols-1 gap-4">
            <button className="group relative w-full h-20 rounded-[24px] bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-white/5 overflow-hidden transition-all hover:border-[#2D7FF9]/30">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-[#2D7FF9]/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              <div className="relative z-10 flex items-center gap-4 px-6 h-full">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-black shadow-sm grid place-items-center text-[#2D7FF9]">
                   <Stethoscope className="h-5 w-5 stroke-[1.5px]" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Radiografia</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Acessar área</div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            <button className="group relative w-full h-20 rounded-[24px] bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-white/5 overflow-hidden transition-all hover:border-[#2D7FF9]/30">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-[#2D7FF9]/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              <div className="relative z-10 flex items-center gap-4 px-6 h-full">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-black shadow-sm grid place-items-center text-[#2D7FF9]">
                   <Building2 className="h-5 w-5 stroke-[1.5px]" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Clínica</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Acessar área</div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

