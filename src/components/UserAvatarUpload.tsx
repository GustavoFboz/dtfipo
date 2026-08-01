import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadUserAvatar } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ImageEditorDialog } from "@/components/ImageEditorDialog";

type Props = {
  avatarUrl: string | null;
  fullName?: string | null;
  email?: string | null;
};

export function UserAvatarUpload({ avatarUrl, fullName, email }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<File | null>(null);

  const initials = (fullName ?? email ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const mut = useMutation({
    mutationFn: async (blob: Blob) => {
      setBusy(true);
      return uploadUserAvatar(blob);
    },
    onSuccess: () => {
      toast.success("Foto de perfil atualizada");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-16 rounded-full overflow-hidden bg-gradient-to-br from-[#2D7FF9] to-[#4a9bff] grid place-items-center text-white text-lg font-semibold shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={fullName ?? "Perfil"} className="h-full w-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/40 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setEditing(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
          <Camera className="h-4 w-4" /> {avatarUrl ? "Trocar foto" : "Enviar foto"}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-1">Recorte e edite antes de enviar · JPG/PNG</p>
      </div>

      <ImageEditorDialog
        open={!!editing}
        file={editing}
        mode="avatar"
        outputSize={512}
        onCancel={() => setEditing(null)}
        onConfirm={(blob) => {
          setEditing(null);
          mut.mutate(blob);
        }}
      />
    </div>
  );
}
