import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTeamMember } from "@/lib/team.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Mail, User, Phone } from "lucide-react";

type AppRole = "CEO" | "DR" | "PROTETICO" | "ATENDIMENTO" | "CADISTA" | "SOLICITANTE" | "USER";

export function AddTeamMemberDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "USER" as AppRole,
    password: "",
    password_confirm: "",
  });

  const queryClient = useQueryClient();
  const createTeamMemberFn = useServerFn(createTeamMember);

  const createMember = useMutation({
    mutationFn: async (data: typeof formData) => {
      const result = await createTeamMemberFn({
        data: {
          email: data.email,
          full_name: data.full_name,
          phone: data.phone,
          role: data.role,
          password: data.password,
        },
      });

      const rpcResult = result as any;
      if (rpcResult && rpcResult.success === false) {
        throw new Error(rpcResult.error || "Erro desconhecido ao criar membro");
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Novo membro adicionado e pronto para login");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["profiles_full"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      queryClient.invalidateQueries({ queryKey: ["cadistas"] });
      setOpen(false);
      setFormData({ full_name: "", email: "", phone: "", role: "USER", password: "", password_confirm: "" });
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar membro: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) {
      toast.error("Nome e Email são obrigatórios");
      return;
    }
    if (formData.password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (formData.password !== formData.password_confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    createMember.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-2xl font-light text-[15px] shadow-2xl shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all duration-300">
          <UserPlus className="h-5 w-5 stroke-[1.2px]" />
          Novo Membro
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] rounded-[2rem] border-slate-100 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="h-12 w-12 rounded-2xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-primary stroke-[1.5px]" />
          </div>
          <DialogTitle className="text-2xl font-light tracking-tight text-slate-900 dark:text-slate-100">Adicionar Colaborador</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-light">
            Cadastre um novo membro e defina seu nível de acesso ao sistema.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">Nome Completo</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 dark:text-slate-600 stroke-[1.5px]" />
                <Input
                  id="full_name"
                  placeholder="Ex: Dr. João Silva"
                  className="pl-10 h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">E-mail Profissional</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 dark:text-slate-600 stroke-[1.5px]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@dentalflow.com"
                  className="pl-10 h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 dark:text-slate-600 stroke-[1.5px]" />
                  <Input
                    id="phone"
                    placeholder="(00) 00000-0000"
                    className="pl-10 h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">Tipo de Acesso</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v as AppRole })}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-100 dark:border-white/10">
                    <SelectItem value="CEO">CEO / Admin</SelectItem>
                    <SelectItem value="DR">Dentista</SelectItem>
                    <SelectItem value="PROTETICO">Protético</SelectItem>
                    <SelectItem value="CADISTA">Cadista</SelectItem>
                    <SelectItem value="ATENDIMENTO">Atendimento</SelectItem>
                    <SelectItem value="SOLICITANTE">Solicitante</SelectItem>
                    <SelectItem value="USER">Usuário Padrão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">Senha (min. 8)</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password_confirm" className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ml-1">Confirmar senha</Label>
                <Input
                  id="password_confirm"
                  type="password"
                  placeholder="••••••••"
                  className="h-12 rounded-xl border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 transition-all font-light"
                  value={formData.password_confirm}
                  onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                />
              </div>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg px-3 py-2">
              Compartilhe esta senha com o membro de forma segura. Ele poderá fazer login imediatamente.
            </p>
          </div>


          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1 h-12 rounded-xl border-slate-100 dark:border-white/10 font-light hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMember.isPending}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:bg-primary/70 disabled:text-primary-foreground disabled:opacity-100"
            >
              {createMember.isPending ? "Salvando..." : "Confirmar Cadastro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
