import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { useEffect, useState } from "react";

import { isDentalFlowWindowsDesktop } from "@/lib/desktop-local";

/**
 * O AppShell do laboratório troca para o cabeçalho mobile abaixo do breakpoint
 * md. No cliente instalado isso também acontece quando o usuário redimensiona a
 * janela; nesse estado o botão Home do cabeçalho desktop deixava de existir.
 *
 * Este atalho aparece apenas no Tauri e apenas abaixo de md, acima da navegação
 * inferior. A versão web/mobile continua usando a navegação responsiva normal.
 */
export function DesktopLabHomeShortcut() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDentalFlowWindowsDesktop());
  }, []);

  if (!desktop) return null;

  return (
    <Link
      to="/hub"
      data-no-window-drag
      className="fixed bottom-[84px] left-3 z-[68] grid h-11 w-11 place-items-center rounded-2xl border border-slate-200/80 bg-white/[0.96] text-slate-500 shadow-[0_12px_30px_-16px_rgba(15,23,42,0.45)] backdrop-blur-sm transition hover:border-[#2D7FF9]/25 hover:text-[#2D7FF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7FF9]/35 md:hidden dark:border-white/10 dark:bg-[#0a0d12]/[0.96] dark:text-slate-300 dark:hover:text-white"
      title="Início"
      aria-label="Voltar ao início"
    >
      <Home className="h-5 w-5 stroke-[1.5]" />
    </Link>
  );
}
