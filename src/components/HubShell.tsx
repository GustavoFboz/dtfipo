import { Outlet } from "@tanstack/react-router";

/**
 * O Hub é uma tela de seleção de ambiente, não um dashboard interno.
 * Ele ocupa toda a janela para reproduzir a composição editorial do seletor.
 * Controles de tema, início, conta e entrada pertencem à própria página do Hub.
 */
export function HubShell() {
  return (
    <div className="min-h-screen bg-[#eef4f8] text-slate-900 dark:bg-[#080b10] dark:text-white">
      <Outlet />
    </div>
  );
}
