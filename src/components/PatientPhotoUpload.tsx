import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUpdate, uploadPatientPhoto } from "@/lib/api";
import { compressSquareImage } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  patientId: string;
  photoUrl: string | null;
  patientName?: string;
  size?: number;
};

export function PatientPhotoUpload({ patientId, photoUrl, patientName, size = 64 }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setBusy(true);
      const blob = await compressSquareImage(file, 320, 0.82);
      const url = await uploadPatientPhoto(patientId, blob);
      await adminUpdate("patients", patientId, { photo_url: url });
      return url;
    },
    onSuccess: () => {
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["patient_cases", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative rounded-full bg-muted overflow-hidden grid place-items-center text-muted-foreground shrink-0"
        style={{ height: size, width: size }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={patientName ?? ""} className="h-full w-full object-cover" />
        ) : (
          <UserIcon className="h-1/2 w-1/2" />
        )}
        {busy && (
          <div className="absolute inset-0 bg-background/70 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
            if (f) mut.mutate(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
          <Camera className="h-4 w-4" /> {photoUrl ? "Trocar foto" : "Enviar foto"}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-1">JPG/PNG · compactada automaticamente</p>
      </div>
    </div>
  );
}
