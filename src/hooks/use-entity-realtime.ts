import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  insertIntoLists,
  patchListsById,
  removeFromListsById,
  subscribeEntity,
} from "@/lib/optimistic";

type Options = {
  /** Extra query keys to invalidate on any change (fallback). */
  invalidate?: QueryKey[];
  /** Extra query keys that contain rows of the same table and can be patched directly. */
  patch?: QueryKey[];
  /** Position for inserts. */
  insertAt?: "start" | "end";
};

/**
 * Assina broadcasts do canal `entity:{table}` (instantâneo entre peers)
 * e `postgres_changes` da mesma tabela (reconciliação com o banco).
 * Aplica insert/update/delete no cache de `queryKey` sem refetch.
 */
export function useEntityRealtime(table: string, queryKey: QueryKey, opts: Options = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let generation = 0;

    const invalidateAll = () => {
      // Só re-executa consultas ativas (que estão montadas na tela).
      // Isso evita a "tempestade" que travava o app quando a aba voltava ao foco.
      qc.invalidateQueries({ queryKey, refetchType: "active" });
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k, refetchType: "active" }));
    };

    const apply = (op: "insert" | "update" | "delete", row: any) => {
      if (!row?.id) return invalidateAll();
      const keys: QueryKey[] = [queryKey, ...(opts.patch ?? opts.invalidate ?? [])];
      for (const k of keys) {
        if (op === "insert") insertIntoLists(qc, k, row, opts.insertAt ?? "start");
        else if (op === "update") patchListsById(qc, k, row.id, row);
        else removeFromListsById(qc, k, row.id);
      }
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k, refetchType: "active" }));
    };


    const unsubPeer = subscribeEntity(table, (p) => apply(p.op, p.row));

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 700);
    };

    const connect = () => {
      if (disposed) return;
      generation += 1;
      const token = generation;
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`db:${table}:${Math.random().toString(36).slice(2, 10)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table }, (payload) =>
          apply("insert", payload.new as any),
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table }, (payload) =>
          apply("update", payload.new as any),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) =>
          apply("delete", payload.old as any),
        )
        .subscribe((status) => {
          if (token !== generation) return;
          // Não invalida em SUBSCRIBED: gerava refetch a cada reconexão/volta de aba.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") scheduleReconnect();
        });
    };

    const recover = () => {
      // Reconecta o canal em segundo plano — sem invalidar caches (evita tela travada ao voltar de aba).
      scheduleReconnect();
    };

    connect();
    window.addEventListener("online", recover);

    return () => {
      disposed = true;
      generation += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("online", recover);
      unsubPeer();
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(queryKey)]);
}

