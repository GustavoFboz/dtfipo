import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assinatura global do chat: mensagens (case_activity) e leituras
 * (case_activity_reads) chegam instantaneamente em qualquer tela,
 * com ou sem o diálogo do caso aberto.
 */
export function useChatRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const refreshActivity = () => {
      qc.invalidateQueries({ queryKey: ["case_activity"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["case_activity_reads"], refetchType: "all" });
    };
    const refreshReads = () => {
      qc.invalidateQueries({ queryKey: ["case_activity_reads"], refetchType: "all" });
    };

    const connect = () => {
      if (disposed) return;
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`chat:${Math.random().toString(36).slice(2, 10)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "case_activity" }, refreshActivity)
        .on("postgres_changes", { event: "*", schema: "public", table: "case_activity_reads" }, refreshReads)
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (!reconnect && !disposed) {
              reconnect = setTimeout(() => {
                reconnect = null;
                connect();
              }, 700);
            }
          }
        });
    };

    connect();
    window.addEventListener("online", connect);

    return () => {
      disposed = true;
      if (reconnect) clearTimeout(reconnect);
      window.removeEventListener("online", connect);
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);
}
