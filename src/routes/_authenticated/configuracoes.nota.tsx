import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { PrintNoteSettings } from "@/components/PrintNoteSettings";

export const Route = createFileRoute("/_authenticated/configuracoes/nota")({
  component: ConfigNotaPage,
});

function ConfigNotaPage() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/configuracoes" className="h-9 w-9 rounded-lg border border-border grid place-items-center hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-11 w-11 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10">
          <Printer className="h-5 w-5 text-primary stroke-[1.2px]" />
        </div>
        <div>
          <h1 className="text-2xl font-light tracking-tight">Nota impressa</h1>
          <p className="text-xs text-muted-foreground">Personalize o que sai na impressora térmica Bluetooth ou comum.</p>
        </div>
      </div>
      <PrintNoteSettings />
    </div>
  );
}
