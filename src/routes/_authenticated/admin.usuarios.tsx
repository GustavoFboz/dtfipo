import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

type AppRole = "admin" | "dentista" | "recepcionista" | "auxiliar" | "protetico" | "cadista";
const ROLES: AppRole[] = ["admin", "dentista", "recepcionista", "auxiliar", "protetico", "cadista"];

export const Route = createFileRoute("/_authenticated/admin/usuarios")({ component: UsuariosPage });

function UsuariosPage() {
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, is_default_admin, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      return data;
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Papel adicionado"); qc.invalidateQueries({ queryKey: ["user_roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Papel removido"); qc.invalidateQueries({ queryKey: ["user_roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Usuários e papéis</h1>
        <p className="text-sm text-muted-foreground">Gerencie quem acessa o sistema e quais permissões cada um tem.</p>
      </header>

      <div className="rounded-xl border bg-card divide-y">
        {profiles.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">Nenhum usuário ainda.</div>
        )}
        {profiles.map((p) => {
          const userRoles = roles.filter((r) => r.user_id === p.id);
          return (
            <div key={p.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.full_name || p.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.email}{p.is_default_admin ? " · admin padrão" : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {userRoles.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs">
                    {r.role}
                    <button onClick={() => removeRole.mutate(r.id)} className="opacity-60 hover:opacity-100" aria-label="Remover">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Select onValueChange={(v) => addRole.mutate({ user_id: p.id, role: v as AppRole })}>
                  <SelectTrigger className="w-36 h-8">
                    <SelectValue placeholder="+ adicionar papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((r) => !userRoles.some((ur) => ur.role === r)).map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        Para criar um novo usuário, peça à pessoa para se cadastrar na tela de login. Depois adicione os papéis aqui.
      </div>
    </div>
  );
}
