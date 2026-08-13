import { useQuery } from "@tanstack/react-query";
import { fetchCases, fetchProfile } from "@/lib/api";
import { CasesTable } from "./CasesTable";
import { DashboardStats } from "./DashboardStats";
import { motion } from "framer-motion";
import { NewCaseDialog } from "./NewCaseDialog";
import { Button } from "./ui/button";
import { Plus, LayoutGrid, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SolicitanteDashboard() {
  const [activeTab, setActiveTab] = useState("solicitacoes");
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

  const { data: solicitacoes = [] } = useQuery({
    queryKey: ["cases", "solicitacoes"],
    queryFn: () => fetchCases("solicitacoes"),
  });

  const tabs = [
    { id: "solicitacoes", label: "Solicitações", icon: AlertCircle, count: solicitacoes.length },
    { id: "em_andamento", label: "Em andamento", icon: Clock },
    { id: "all", label: "Todos", icon: LayoutGrid },
    { id: "finalizados", label: "Finalizados", icon: CheckCircle2 },
  ];

  return (
    <div className="flex-1 flex flex-col gap-8 min-h-0">
      <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8 pt-10 md:pt-14 pb-8 md:pb-12 shrink-0 border-b border-border/40 mb-2">
        <div className="space-y-2">
          <h1 className="text-4xl lg:text-5xl xl:text-7xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1]">
            Suas <span className="text-[#54A8FB]">Solicitações</span>
          </h1>
          <p className="text-muted-foreground font-light text-lg">
            Acompanhe o status dos seus pedidos enviados ao laboratório.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <NewCaseDialog
            trigger={
              <Button className="h-16 px-10 rounded-full bg-[#54A8FB] hover:bg-[#54A8FB]/90 text-white shadow-lg shadow-[#54A8FB]/25 font-normal text-[17px] gap-3 transition-all hover:shadow-xl hover:shadow-[#54A8FB]/30 hover:-translate-y-[1px]">
                <Plus className="h-5 w-5 stroke-[1.5px]" /> Nova entrada
              </Button>
            }
          />
        </div>
      </header>

      <div className="flex items-center justify-between gap-8">
        <DashboardStats />
      </div>

      <div className="flex items-center gap-2 p-1.5 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                isActive 
                  ? "bg-white dark:bg-slate-900 text-[#54A8FB] shadow-sm ring-1 ring-black/[0.03]" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-[#54A8FB]" : "text-slate-400")} />
              {tab.label}
              {tab.id === "solicitacoes" && (solicitacoes?.length ?? 0) > 0 && (
                <span className="absolute -top-2 -right-1 h-5 min-w-[20px] px-1.5 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold grid place-items-center shadow-lg shadow-rose-500/20">
                  {solicitacoes.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 min-h-0 bg-white dark:bg-neutral-900 rounded-[32px] border border-border/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] overflow-hidden"
      >
        <CasesTable 
          activeFilter={activeTab} 
          hideToolbar 
          minimal 
        />
      </motion.div>
    </div>
  );
}
