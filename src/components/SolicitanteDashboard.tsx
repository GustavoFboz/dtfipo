import { useQuery } from "@tanstack/react-query";
import { fetchCases, fetchProfile } from "@/lib/api";
import { CasesTable } from "./CasesTable";
import { DashboardStats } from "./DashboardStats";
import { motion } from "framer-motion";

export function SolicitanteDashboard() {
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases", "solicitante"],
    queryFn: () => fetchCases("all"),
  });

  return (
    <div className="flex-1 flex flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-light tracking-tight">Suas Solicitações</h1>
        <p className="text-muted-foreground font-light">
          Acompanhe o status dos seus pedidos enviados ao laboratório.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DashboardStats />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 min-h-0 bg-white dark:bg-neutral-900 rounded-3xl border border-border/50 shadow-sm overflow-hidden"
      >
        <CasesTable hideToolbar activeFilter="all" />
      </motion.div>
    </div>
  );
}
