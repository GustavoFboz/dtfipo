import { createFileRoute } from "@tanstack/react-router";
import { Factory } from "lucide-react";
import { FinanceiroSectionPlaceholder } from "@/components/financial/FinanceiroSectionPlaceholder";

export const Route = createFileRoute("/_authenticated/financeiro/producao")({
  component: () => (
    <FinanceiroSectionPlaceholder
      eyebrow="Produção"
      title="Apontamentos de produção"
      description="Registro da produção por profissional e caso, com aplicação automática das regras financeiras cadastradas."
      icon={Factory}
    />
  ),
});
