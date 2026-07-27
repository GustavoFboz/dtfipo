import { createFileRoute, redirect } from "@tanstack/react-router";

// Módulo Financeiro temporariamente desativado — todas as rotas /financeiro/* caem aqui e são redirecionadas.
export const Route = createFileRoute("/_authenticated/financeiro")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
