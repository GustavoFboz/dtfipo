import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/forgot")({ ssr: false, component: ForgotPage });

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Se o e-mail existir, você receberá um link para redefinir a senha.");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-1">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Informe seu e-mail para receber o link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="e">E-mail</Label>
            <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </Button>
          <Link to="/auth" search={{ invite: undefined, mode: undefined }} className="block text-sm text-center text-muted-foreground hover:underline">
            Voltar
          </Link>
        </form>
      </div>
    </div>
  );
}
