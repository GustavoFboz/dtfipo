import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Mail, Shield, Camera, Edit2, Check, X, LogOut, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { fetchProfile, updateProfile, uploadUserAvatar } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageEditorDialog } from "./ImageEditorDialog";
import { motion, AnimatePresence } from "framer-motion";

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO / Administrador",
  DR: "Dentista",
  PROTETICO: "Protético",
  ATENDIMENTO: "Atendimento",
  CADISTA: "Cadista",
  USER: "Usuário",
};

export function ProfilePopover({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({ 
    queryKey: ["profile"], 
    queryFn: fetchProfile 
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [editingAvatar, setEditingAvatar] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: (updates: { full_name: string }) => 
      updateProfile(profile!.id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado com sucesso");
      setIsEditing(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const avatarMutation = useMutation({
    mutationFn: (blob: Blob) => uploadUserAvatar(blob),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Foto de perfil atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const handleSave = () => {
    if (!name.trim()) return;
    updateMutation.mutate({ full_name: name });
  };

  if (isLoading || !profile) return children;

  const initials = profile.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent 
        side="right" 
        align="start" 
        sideOffset={12}
        className="w-80 p-0 overflow-hidden border-slate-100 dark:border-white/5 shadow-2xl rounded-3xl bg-white dark:bg-slate-950"
      >
        <div className="relative h-24 bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-transparent" />
        
        <div className="px-6 pb-6 -mt-12">
          <div className="relative inline-block mb-4">
            <div className="h-24 w-24 rounded-3xl border-4 border-white dark:border-slate-950 overflow-hidden bg-white dark:bg-slate-900 shadow-xl group">
              <Avatar className="h-full w-full rounded-none">
                <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary rounded-none">
                  {initials}
                </AvatarFallback>
              </Avatar>
              
              <button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setEditingAvatar(file);
                  };
                  input.click();
                }}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
              >
                <Camera className="h-6 w-6" />
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!isEditing ? (
              <motion.div
                key="view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-1"
              >
                <div className="flex items-center justify-between group">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                    {profile.full_name}
                  </h3>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="text-[13px] font-medium uppercase tracking-wider">
                    {ROLE_LABELS[profile.role] || profile.role}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <Input 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                  className="h-10 text-[15px] font-medium"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="flex-1 rounded-xl h-9" 
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" /> Salvar
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="rounded-xl h-9" 
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 space-y-4 pt-6 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <Mail className="h-4 w-4" />
              <span className="text-sm font-light truncate">{profile.email}</span>
            </div>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl px-2 h-10 transition-colors"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-3" />
              <span className="text-sm font-medium">Encerrar sessão</span>
            </Button>
          </div>
        </div>

        <ImageEditorDialog
          open={!!editingAvatar}
          file={editingAvatar}
          mode="avatar"
          outputSize={512}
          onCancel={() => setEditingAvatar(null)}
          onConfirm={(blob) => {
            setEditingAvatar(null);
            avatarMutation.mutate(blob);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
