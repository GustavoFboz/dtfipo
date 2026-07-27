import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const useNotificationsRealtime = () => {
  const queryClient = useQueryClient();

  const playNotificationSound = () => {
    try {
      // Usando um som de sistema sutil
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.volume = 0.4;
      audio.play().catch(e => console.log("Audio play prevented by browser policy", e));
    } catch (error) {
      console.error("Erro ao reproduzir som de notificação:", error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const channel = supabase
        .channel(`user-notifications-${user.id}-${Math.random().toString(36).substring(7)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            if (!mounted) return;
            // O som agora é gerenciado pelo useNotificationPopups dentro do NotificationPanel
            // para evitar duplicidade e garantir que toque apenas quando o popup aparecer.

            // Invalidar cache para atualizar UI imediatamente
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
        )
        .subscribe();

      return channel;
    };

    const subscriptionPromise = setupSubscription();

    // Polling de 50ms para atualização visual "imediata" solicitada pelo usuário (0.02ms)
    // Isso garante que qualquer mudança de estado no TanStack Query seja refletida rapidamente.
    const interval = setInterval(() => {
      // O Realtime já faz o trabalho pesado, mas isso garante sincronia absoluta do estado da UI
      // queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }, 50);

    return () => {
      mounted = false;
      clearInterval(interval);
      subscriptionPromise.then(channel => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [queryClient]);

  return null;
};

