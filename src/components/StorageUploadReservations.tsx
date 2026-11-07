import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import {
  canReviewStorageReservation, fetchStorageUploadReservations, formatStorageBytes,
  refreshStorageUsage, releaseStorageUploadReservation, type ManagedStorageFile,
} from "@/lib/storage";

export function StorageUploadReservations({ ownerId, clinicId }: { ownerId: string; clinicId: string }) {
  const qc = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const queryKey = ["storage_upload_reservations", ownerId, clinicId];
  const reservations = useQuery({ queryKey, queryFn: () => fetchStorageUploadReservations(clinicId), staleTime: 5_000, retry: false });
  const release = useMutation({
    mutationFn: releaseStorageUploadReservation,
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey });
      if (!mounted.current) return;
      toast.success(result.released ? "Espaço do envio pendente liberado" : "Este envio já foi liberado. Lista atualizada.");
      void refreshStorageUsage();
    },
    onError: (error: Error) => { if (mounted.current) toast.error(error.message); },
  });
  async function review(file: ManagedStorageFile) {
    const accepted = await confirm({
      title: "Liberar espaço do envio pendente",
      description: `Confirme que o envio de “${file.original_name}” foi abandonado. O servidor só liberará ${formatStorageBytes(file.size_bytes)} se o arquivo não existir e não houver registro vinculado. Para enviar depois, inicie um novo upload.`,
      confirmText: "Confirmar liberação",
    });
    if (accepted && mounted.current) release.mutate(file);
  }
  const rows = reservations.data ?? [];
  const bytes = rows.reduce((sum, file) => sum + Number(file.size_bytes), 0);
  return <section aria-label="Envios pendentes" className="rounded-[28px] border border-slate-100 bg-white p-5 md:p-6 dark:border-white/[0.08] dark:bg-slate-950">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium text-slate-900 dark:text-white">Envios pendentes</h2>
      <button onClick={() => { void reservations.refetch(); }} disabled={reservations.isFetching || release.isPending} className="text-sm text-primary disabled:opacity-40">Atualizar envios</button>
    </div>
    <p className="mt-2 text-sm text-slate-500">Uploads que não foram concluídos também reservam espaço. Revise apenas envios abandonados há pelo menos 24 horas.</p>
    {reservations.isLoading && <p className="mt-4 text-sm text-slate-500">Consultando envios pendentes…</p>}
    {reservations.isError && <p role="alert" className="mt-4 text-sm text-amber-700 dark:text-amber-300">Não foi possível consultar os envios. Conecte-se à internet e atualize a lista. O espaço permanece reservado.</p>}
    {!reservations.isLoading && !reservations.isError && rows.length === 0 && <p className="mt-4 text-sm text-slate-500">Nenhum envio pendente.</p>}
    {rows.length > 0 && <>
      <p className="mt-4 text-xs text-slate-500">{rows.length} envio(s) nesta lista · {formatStorageBytes(bytes)} reservados{rows.length === 200 ? " · Exibindo os 200 mais antigos" : ""}</p>
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
        {rows.map((file) => {
          const reviewable = canReviewStorageReservation(file);
          return <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="break-words text-sm text-slate-800 dark:text-slate-100">{file.original_name}</p>
              <p className="mt-1 text-xs text-slate-500">{formatStorageBytes(file.size_bytes)} · {new Date(file.created_at).toLocaleString("pt-BR")}</p>
            </div>
            <button disabled={!reviewable || release.isPending || reservations.isFetching} onClick={() => { void review(file); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-primary disabled:opacity-40 dark:border-white/10">
              {release.isPending && release.variables?.id === file.id ? "Verificando…" : reviewable ? "Liberar espaço" : "Envio recente"}
            </button>
          </li>;
        })}
      </ul>
    </>}
  </section>;
}
