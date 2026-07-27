import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { FinanceiroSectionPlaceholder } from "@/components/financial/FinanceiroSectionPlaceholder";

export const Route = createFileRoute("/_authenticated/financeiro/fluxo-caixa")({
  component: () => (
    <FinanceiroSectionPlaceholder
      eyebrow="Fluxo de Caixa"
      title="Entradas e saídas"
      description="Visão diária, semanal e mensal do fluxo — saldos projetados e realizados por conta e carteira."
      icon={TrendingUp}
    />
  ),
});
