import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { NEW_PASSWORD_MIN_LENGTH, PASSWORD_MINIMUM_MESSAGE, newPasswordError } from "@/lib/auth/password-policy";

export const Route = createFileRoute("/auth/reset")({ ssr: false, component: ResetPage });

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = newPasswordError(password);
    if (passwordError) return toast.error(passwordError);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return toast.error(error.message);
      toast.success("Senha atualizada com sucesso!");
      navigate({ to: "/", replace: true });
    } catch {
      toast.error("Não foi possível confirmar a alteração da senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-1">Definir nova senha</h1>
        <p className="text-sm text-muted-foreground mb-4">{PASSWORD_MINIMUM_MESSAGE}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="p">Nova senha</Label>
            <Input id="p" type="password" autoComplete="new-password" minLength={NEW_PASSWORD_MIN_LENGTH} value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
