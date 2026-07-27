// @ts-nocheck
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type AppRole = "CEO" | "DR" | "PROTETICO" | "ATENDIMENTO" | "CADISTA" | "USER";
const ROLES: AppRole[] = ["CEO", "DR", "PROTETICO", "ATENDIMENTO", "CADISTA", "USER"];
const EMPTY_ARR: readonly never[] = [];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
  } | null;
}

export function EditTeamMemberDialog({ open, onOpenChange, profile }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-3xl max-h-[90vh] overflow-y-auto">
        {open && profile ? (
          <EditTeamMemberBody
            key={profile.id}
            profile={profile}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditTeamMemberBody({
  profile,
  onDone,
}: {
  profile: NonNullable<Props["profile"]>;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    role: (profile.role as AppRole) ?? "USER",
  });
  const [accessIds, setAccessIds] = useState<Set<string> | null>(null);

  const { data: categories = EMPTY_ARR } = useQuery({
    queryKey: ["component_categories_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("component_categories")
        .select("id, name")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: currentAccess = EMPTY_ARR } = useQuery({
    queryKey: ["user_stock_access", profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_stock_access")
        .select("category_id")
        .eq("user_id", profile.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const effectiveAccessIds = useMemo(
    () =>
      accessIds ??
      new Set((currentAccess as any[]).map((a: any) => a.category_id as string)),
    [accessIds, currentAccess],
  );

  const updateMember = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("update_team_member", {
        p_user_id: profile.id,
        p_full_name: form.full_name,
        p_email: form.email,
        p_phone: form.phone,
        p_role: form.role,
        p_category_ids: [...effectiveAccessIds],
      } as never);
      if (error) throw error;
      const res = data as { success?: boolean; error?: string } | null;
      if (res && res.success === false) throw new Error(res.error ?? "Falha ao atualizar");
    },
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso");
      qc.invalidateQueries({ queryKey: ["profiles_full"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["user_stock_access"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAccess = (id: string) => {
    setAccessIds(() => {
      const next = new Set(effectiveAccessIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-light tracking-tight">Editar membro da equipe</DialogTitle>
        <DialogDescription className="text-sm text-slate-500 font-light">
          Atualize as informações e o nível de acesso deste colaborador.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-600">Nome completo</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-600">E-mail</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-11 rounded-xl"
          />
          <p className="text-[10px] text-slate-400">Alterar o e-mail aqui só atualiza o perfil exibido, não o login.</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-600">Telefone</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-600">Nível de acesso</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{r === "DR" ? "Dentista" : r === "PROTETICO" ? "Protético" : r === "ATENDIMENTO" ? "Atendimento" : r === "CADISTA" ? "Cadista" : r === "USER" ? "Usuário" : r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <Label className="text-xs font-medium text-slate-600">Acesso ao estoque por categoria</Label>
          <p className="text-[10px] text-slate-400">
            Selecione as categorias que este usuário poderá acessar isoladamente. Administradores (CEO/DR) têm acesso total automaticamente.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 space-y-2">
            {categories.length === 0 && (
              <p className="text-xs text-slate-400">Nenhuma categoria cadastrada.</p>
            )}
            {categories.map((cat: any) => (
              <label key={cat.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg">
                <Checkbox
                  checked={effectiveAccessIds.has(cat.id)}
                  onCheckedChange={() => toggleAccess(cat.id)}
                />
                <span className="text-sm text-slate-700">{cat.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone} className="rounded-xl">Cancelar</Button>
        <Button
          onClick={() => updateMember.mutate()}
          disabled={updateMember.isPending}
          className="rounded-xl"
        >
          {updateMember.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </>
  );
}

