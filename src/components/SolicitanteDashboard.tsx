import { useQuery } from "@tanstack/react-query";
import { fetchCases, fetchProfile } from "@/lib/api";
import { CasesTable } from "./CasesTable";
import { DashboardStats } from "./DashboardStats";
import { motion } from "framer-motion";
import { NewCaseDialog } from "./NewCaseDialog";
import { Button } from "./ui/button";
import { Plus } from "lucide-react";

export function SolicitanteDashboard() {
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases", "solicitante"],
    queryFn: () => fetchCases("all"),
  });

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
              <Button className="h-16 px-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 font-normal text-[17px] gap-3 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-[1px]">
                <Plus className="h-5 w-5 stroke-[1.5px]" /> Nova entrada
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <DashboardStats />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 min-h-0 bg-white dark:bg-neutral-900 rounded-3xl border border-border/50 shadow-sm overflow-hidden"
      >
        <CasesTable activeFilter="all" />
      </motion.div>
    </div>
  );
}
