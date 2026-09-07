import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reauth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo:
      typeof search.returnTo === "string" && search.returnTo.startsWith("/") && !search.returnTo.startsWith("//")
        ? search.returnTo
        : "/hub",
  }),
  component: ReauthPage,
});

function ReauthPage() {
  const search = useSearch({ from: "/reauth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Sessão online revalidada.");
      window.location.replace(search.returnTo || "/hub");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f7f9fc] px-5 text-slate-950 dark:bg-[#07090d] dark:text-white">
      <form onSubmit={submit} className="w-full max-w-[430px] rounded-[28px] border border-slate-200/80 bg-white p-7 shadow-[0_24px_80px_-42px_rgba(15,23,42,.35)] dark:border-white/10 dark:bg-[#0d1117] sm:p-9">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2D7FF9]/10 text-[#2D7FF9]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">DentalFlow Desktop 0.2.8</div>
        <h1 className="mt-2 text-[30px] font-light tracking-[-0.04em]">Revalidar sessão online</h1>
        <p className="mt-2 text-sm font-light leading-6 text-slate-500 dark:text-slate-400">
          Entre novamente para confirmar sua identidade no Lovable Cloud e baixar todos os dados autorizados desta conta para o Windows.
        </p>

        <div className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-slate-500">E-mail</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="h-11 rounded-xl" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-slate-500">Senha</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="h-11 rounded-xl" />
          </label>
        </div>

        <Button type="submit" disabled={loading} className="mt-6 h-11 w-full rounded-xl bg-[#2D7FF9] text-white hover:bg-[#226fe1]">
          {loading ? "Validando…" : "Validar e sincronizar"}
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>

        <button type="button" onClick={() => window.location.replace(search.returnTo || "/hub")} className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          Voltar e usar somente os dados locais
        </button>
      </form>
    </main>
  );
}
