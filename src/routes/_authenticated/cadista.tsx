import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { CadistaStockView } from "@/components/CadistaStockView";
import { CadistaCaseCard } from "@/components/CadistaCaseCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Package, ShieldAlert, Zap } from "lucide-react";
import { fetchCases } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/cadista")({
  component: CadistaDashboard,
});

function CadistaDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ["cadista_cases"],
    queryFn: () => fetchCases("active"),
    enabled: !!profile,
  });

  useEffect(() => {
    fetchProfile().then((p) => {
      setProfile(p);
      setLoading(false);
      if (p && p.role !== "CADISTA" && p.role !== "CEO") {
        navigate({ to: "/" });
      }
    });
  }, [navigate]);

  if (loading) return <div className="p-10 text-center text-primary font-medium animate-pulse">Carregando painel...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-6 md:p-10 pb-20 font-light selection:bg-indigo-500/30">
      <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/5 border border-indigo-500/10 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.08em]">
            <Zap className="h-3 w-3" />
            Módulo de Design CAD
          </div>
          <h1 className="text-5xl md:text-6xl font-extralight text-white leading-[1.1] tracking-tight">
            Painel do <span className="text-indigo-400 font-light italic">Cadista</span>
          </h1>
          <p className="text-slate-500 font-light text-lg max-w-xl border-l border-slate-800/50 pl-6 mt-4">
            Ambiente exclusivo para processamento de casos e controle de insumos digitais.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-end">
          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 border border-slate-800 rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] shadow-2xl backdrop-blur-md">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.5)] animate-pulse" />
            Estação Conectada
          </div>
        </div>
      </header>

      <Tabs defaultValue="cases" className="space-y-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 backdrop-blur-xl p-2 rounded-[2rem] border border-white/5 shadow-2xl">
          <TabsList className="bg-black/20 p-1 rounded-full border border-white/5 h-12">
            <TabsTrigger 
              value="cases" 
              className="rounded-full px-8 data-[state=active]:bg-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-lg font-light text-xs gap-2 transition-all duration-500 uppercase tracking-[0.08em]"
            >
              <LayoutDashboard className="h-4 w-4 stroke-[1.2px]" /> Meus Casos
            </TabsTrigger>
            <TabsTrigger 
              value="stock" 
              className="rounded-full px-8 data-[state=active]:bg-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-lg font-light text-xs gap-2 transition-all duration-500 uppercase tracking-[0.08em]"
            >
              <Package className="h-4 w-4 stroke-[1.2px]" /> Estoque
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cases" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.1em] flex items-center gap-3">
              <div className="h-1 w-8 bg-indigo-500/50 rounded-full" />
              Casos em Produção
            </h2>
          </div>

          {casesLoading ? (
             <div className="text-center py-24 text-slate-600 font-extralight uppercase tracking-[0.4em] animate-pulse">Sincronizando banco de dados...</div>
          ) : cases.length === 0 ? (
             <div className="text-center py-32 bg-slate-900/20 rounded-[3rem] border border-white/5 backdrop-blur-sm">
               <div className="h-20 w-20 bg-slate-900 shadow-2xl rounded-[2rem] grid place-items-center mx-auto mb-8 border border-white/5">
                 <ShieldAlert className="h-8 w-8 text-slate-700 stroke-[1px]" />
               </div>
               <p className="text-slate-400 font-light uppercase tracking-[0.08em] text-sm">Fila de trabalho vazia</p>
               <p className="text-slate-600 text-xs mt-3 font-light">Aguardando novos escaneamentos do sistema principal.</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {cases.map((c, i) => (
                <div key={c.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: `${i * 100}ms` }}>
                  <CadistaCaseCard caseRow={c} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stock" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-[10px] font-bold text-indigo-400 bg-indigo-500/5 px-5 py-2.5 rounded-full border border-indigo-500/10 shadow-xl backdrop-blur-md uppercase tracking-[0.08em]">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              Monitoramento de Insumos CAD
            </div>
          </div>
          <div className="bg-slate-900/30 rounded-[3rem] p-8 shadow-2xl border border-white/5 backdrop-blur-xl">
            <CadistaStockView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
