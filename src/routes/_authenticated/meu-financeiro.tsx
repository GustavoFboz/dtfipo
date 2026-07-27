import { createFileRoute, redirect } from "@tanstack/react-router";

// Módulo Financeiro temporariamente desativado — redireciona qualquer acesso para o hub.
export const Route = createFileRoute("/_authenticated/meu-financeiro")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
