import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribeEntity } from '@/lib/optimistic';
import notificationSound from '@/assets/notification.mp3';


export type PopupNotification = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  type?: string | null;
  metadata?: any;
  read_at?: string | null;
};

export function useNotificationPopups() {
  const [popups, setPopups] = useState<PopupNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    // ---------- Áudio ----------
    // Estratégia: nunca "trancar" com um flag `unlocked`. Em toda chegada de
    // notificação, tentamos (a) resumir/tocar via WebAudio, (b) tocar via
    // HTMLAudio, (c) beep sintetizado como último recurso. Também tentamos
    // preparar o AudioContext em qualquer interação do usuário e no
    // visibilitychange, mas isso é *auxiliar* — nunca gate.
    const audioPool: HTMLAudioElement[] = Array.from({ length: 3 }, () => {
      const a = new Audio(notificationSound);
      a.volume = 1;
      a.preload = "auto";
      a.crossOrigin = "anonymous";
      a.load();
      return a;
    });
    audioRef.current = audioPool[0];

    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    let audioCtx: AudioContext | null = null;
    let audioBuffer: AudioBuffer | null = null;
    let bufferLoading: Promise<AudioBuffer | null> | null = null;

    const ensureCtx = () => {
      if (!AC) return null;
      if (!audioCtx) {
        try { audioCtx = new AC(); } catch { audioCtx = null; }
      }
      return audioCtx;
    };

    const ensureBuffer = () => {
      if (audioBuffer) return Promise.resolve(audioBuffer);
      if (bufferLoading) return bufferLoading;
      bufferLoading = (async () => {
        const ctx = ensureCtx();
        if (!ctx) return null;
        try {
          const res = await fetch(notificationSound, { cache: "force-cache" });
          const buf = await res.arrayBuffer();
          audioBuffer = await ctx.decodeAudioData(buf.slice(0));
          return audioBuffer;
        } catch { return null; }
      })();
      return bufferLoading;
    };
    ensureBuffer().catch(() => {});

    const tryResumeCtx = () => {
      const ctx = ensureCtx();
      if (!ctx) return Promise.resolve(false);
      if (ctx.state === "running") return Promise.resolve(true);
      return ctx.resume().then(() => ctx.state === "running").catch(() => false);
    };

    const playWebAudio = () => {
      if (!audioCtx || audioCtx.state !== "running" || !audioBuffer) return false;
      try {
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        const gain = audioCtx.createGain();
        gain.gain.value = 1;
        src.connect(gain).connect(audioCtx.destination);
        src.start(0);
        return true;
      } catch { return false; }
    };

    const playBeep = () => {
      if (!audioCtx || audioCtx.state !== "running") return false;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
        return true;
      } catch { return false; }
    };

    let poolIdx = 0;
    const playHtmlAudio = () => {
      const a = audioPool[poolIdx];
      poolIdx = (poolIdx + 1) % audioPool.length;
      try {
        a.muted = false;
        a.volume = 1;
        a.currentTime = 0;
        const p = a.play();
        if (p && typeof p.then === "function") {
          return p.then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
      } catch {
        return Promise.resolve(false);
      }
    };

    const playNotificationSound = async () => {
      // 1) Tenta resumir o ctx e usar WebAudio (mais confiável).
      await tryResumeCtx();
      if (!audioBuffer) await ensureBuffer();
      if (playWebAudio()) return;
      // 2) HTMLAudio.
      const ok = await playHtmlAudio();
      if (ok) return;
      // 3) Beep sintetizado — se ctx estiver rodando.
      if (playBeep()) return;
      // 4) Último recurso: tenta HTMLAudio novamente com um pequeno delay
      //    (às vezes o primeiro play() é bloqueado enquanto o buffer decoda).
      setTimeout(() => { void playHtmlAudio(); }, 60);
    };

    // Prepara ctx/audio em qualquer interação — puramente auxiliar.
    const primeAudio = () => {
      ensureCtx();
      void tryResumeCtx();
      ensureBuffer().catch(() => {});
      // Um "silent play" para destravar HTMLAudio em navegadores estritos.
      for (const a of audioPool) {
        const prev = a.volume;
        a.volume = 0;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = prev; }).catch(() => { a.volume = prev; });
      }
    };
    const interactionOpts = { capture: true, passive: true } as const;
    const keydownOpts = { capture: true } as const;
    const onVisibility = () => { if (!document.hidden) { ensureCtx(); void tryResumeCtx(); } };
    window.addEventListener("pointerdown", primeAudio, interactionOpts);
    window.addEventListener("keydown", primeAudio, keydownOpts);
    window.addEventListener("touchstart", primeAudio, interactionOpts);
    window.addEventListener("click", primeAudio, interactionOpts);
    document.addEventListener("visibilitychange", onVisibility);
    // Se já houve interação antes do hook montar, prepara agora.
    if ((navigator as any).userActivation?.hasBeenActive) primeAudio();




    let cancelled = false;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    const seenIds = new Set<string>();
    let currentUserId: string | null = null;

    // ---------- Notificações do sistema operacional ----------
    // Pede permissão uma vez (após qualquer interação do usuário) e, quando a
    // aba não estiver visível/focada, entrega a notificação no computador.
    const requestPermission = () => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    };

    // Gera um avatar circular com iniciais (data URL) para quando o usuário
    // não tem foto — assim a notificação do sistema sempre mostra algo ao lado.
    const buildInitialsIcon = (name: string | null) => {
      try {
        const size = 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        const initials = (name || "?")
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("");
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#2563eb";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 84px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials || "?", size / 2, size / 2 + 4);
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    };

    // Converte a foto do usuário em data URL: o Chrome no Windows às vezes não
    // renderiza URLs assinadas remotas no ícone da notificação.
    const toDataUrl = async (url: string) => {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("avatar fetch failed");
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("avatar read failed"));
        reader.readAsDataURL(blob);
      });
    };

    const showDesktopNotification = (n: any) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
      try {
        const meta = (n.metadata || {}) as {
          sender_name?: string | null;
          sender_avatar?: string | null;
          case_label?: string | null;
        };
        const sender = meta.sender_name || null;
        const caseLabel = meta.case_label || null;
        const type = (n.type ?? "").toLowerCase();
        let title = n.title || "Nova notificação";
        if (sender) {
          const verb = type === "attachment" ? "anexou um arquivo" : "comentou";
          title = caseLabel ? `${sender} ${verb} no caso ${caseLabel}` : `${sender} ${verb}`;
        } else if (caseLabel) {
          title = `${title} · ${caseLabel}`;
        }
        const fallbackIcon = buildInitialsIcon(sender) || "/icon-512.png";
        const notif = new Notification(title, {
          body: n.content || "",
          icon: fallbackIcon,
          badge: fallbackIcon,
          tag: n.id,
        });

        // Se houver foto, troca o ícone por ela assim que baixar (mesma tag
        // substitui a notificação já exibida).
        if (meta.sender_avatar) {
          toDataUrl(meta.sender_avatar)
            .then((dataUrl) => {
              const replaced = new Notification(title, {
                body: n.content || "",
                icon: dataUrl,
                badge: dataUrl,
                tag: n.id,
              });
              replaced.onclick = notif.onclick;
            })
            .catch(() => {});
        }


        notif.onclick = () => {
          window.focus();
          const meta = (n.metadata || {}) as { case_id?: string; activity_id?: string | null };
          if (meta.case_id) {
            const focus = n.type === "comment" ? "comments" : n.type === "attachment" ? "attachments" : "overview";
            const parts = [`case=${meta.case_id}`, `focus=${focus}`];
            if (focus === "comments") parts.push("tab=comentarios");
            if (meta.activity_id) parts.push(`msg=${meta.activity_id}`);
            window.location.hash = parts.join("&");
            window.dispatchEvent(new Event("hashchange"));
          }
          notif.close();
        };
        return true;
      } catch {
        return false;
      }
    };

    const handleNewNotif = (newNotif: any) => {
      if (!newNotif?.id) return;
      if (seenIds.has(newNotif.id)) return;
      if (currentUserId && newNotif.recipient_id && newNotif.recipient_id !== currentUserId) return;
      seenIds.add(newNotif.id);

      qc.setQueryData(['notifications'], (old: any[] = []) => {
        if (old.some((n) => n.id === newNotif.id)) return old;
        return [newNotif, ...old];
      });
      qc.invalidateQueries({ queryKey: ['notifications'] });

      setUnreadCount((prev) => prev + 1);

      const away = document.hidden || !document.hasFocus();

      // Som sempre toca, inclusive quando a notificação vai para o sistema.
      void playNotificationSound();

      if (away && showDesktopNotification(newNotif)) {
        // Entregue no computador — sem popup na tela.
        return;
      }

      setPopups((prev) => (prev.some((p) => p.id === newNotif.id) ? prev : [newNotif, ...prev]));
    };

    requestPermission();
    window.addEventListener('pointerdown', requestPermission, interactionOpts);
    window.addEventListener('keydown', requestPermission, keydownOpts);


    // Peer broadcast: chega ANTES do postgres_changes (otimista).
    const unsubPeer = subscribeEntity('notifications', (p) => {
      if (p.op === 'insert' && p.row) handleNewNotif(p.row);
    });

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      currentUserId = user.id;

      const channel = supabase
        .channel(`notifications-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => handleNewNotif(payload.new as any),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
          }
        )
        .subscribe();

      if (cancelled) {
        supabase.removeChannel(channel);
      } else {
        activeChannel = channel;
      }
    };

    setupRealtime();

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', primeAudio, interactionOpts);
      window.removeEventListener('keydown', primeAudio, keydownOpts);
      window.removeEventListener('touchstart', primeAudio, interactionOpts);
      window.removeEventListener('click', primeAudio, interactionOpts);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', requestPermission, interactionOpts);
      window.removeEventListener('keydown', requestPermission, keydownOpts);

      unsubPeer();
      if (activeChannel) supabase.removeChannel(activeChannel);
    };
  }, [qc]);

  const removePopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  return { popups, unreadCount, setUnreadCount, removePopup };
}
