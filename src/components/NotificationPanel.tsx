import { useState } from "react";
import type { Profile } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCircle2, Trash2, CheckCheck, MessageSquare, Paperclip } from "lucide-react";
import { useNotificationPopups, type PopupNotification } from "@/hooks/use-notification-popups";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, adminDelete } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NotifFilter = "all" | "updates" | "messages";

const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "updates", label: "Atualizações" },
  { key: "messages", label: "Mensagens" },
];
const MESSAGE_TYPES = ["comment", "attachment", "mention", "message"];

function matchesFilter(type: string | null | undefined, filter: NotifFilter) {
  if (filter === "all") return true;
  const t = String(type || "").toLowerCase();
  return filter === "messages" ? MESSAGE_TYPES.includes(t) : !MESSAGE_TYPES.includes(t);
}

function initialsOf(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function NotificationPanel({ profile: externalProfile }: { profile?: Profile }) {
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: () => import("@/lib/api").then((m) => m.fetchProfile()),
  });
  const profile = externalProfile ?? profileData;
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotifFilter>("all");
  const { popups, removePopup, openNotification } = useNotificationPopups();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 300_000,
    refetchInterval: 600_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const deleteNotif = useMutation({
    mutationFn: (id: string) => adminDelete("notifications", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const openFromNotification = (n: any) => {
    if (!n.read_at) markRead.mutate(n.id);
    setIsOpen(false);
    openNotification(n as PopupNotification);
  };

  const unreadDbCount = notifications.filter((n: any) => !n.read_at).length;
  const filtered = notifications.filter((n: any) => matchesFilter(n.type, filter));

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <motion.button
            id="notification-trigger"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-primary focus:outline-none dark:hover:bg-white/5"
            aria-label="Notificações"
          >
            <Bell className="h-[21px] w-[21px] stroke-[1.4px]" />
            <AnimatePresence>
              {unreadDbCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-950"
                >
                  {unreadDbCount > 99 ? "99+" : unreadDbCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[380px] overflow-hidden rounded-2xl border-slate-100 bg-white/95 p-0 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center justify-between border-b border-slate-50 p-4 dark:border-slate-800/50">
            <h3 className="text-sm font-semibold tracking-tight">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadDbCount > 0 && (
                <button type="button" onClick={() => markAll.mutate()} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary hover:underline">
                  <CheckCheck className="h-3 w-3" /> Marcar todas
                </button>
              )}
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/60">{filtered.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/50">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  filter === item.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <ScrollArea className="h-[400px]">
            {filtered.length === 0 ? (
              <div className="flex h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-50 dark:bg-slate-800/50">
                  <Bell className="h-6 w-6 text-slate-200 dark:text-slate-700" />
                </div>
                <p className="text-sm font-light text-slate-400">Nenhuma notificação por aqui.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {filtered.map((n: any) => {
                  const isMessage = MESSAGE_TYPES.includes(String(n.type || "").toLowerCase());
                  const senderName = n.metadata?.sender_name ?? n.sender?.full_name ?? n.sender?.email ?? null;
                  const avatarUrl = n.metadata?.sender_avatar ?? n.sender?.avatar_url;
                  const title = isMessage && senderName
                    ? n.type === "attachment" ? `${senderName} anexou um arquivo` : `${senderName} comentou`
                    : n.title;

                  return (
                    <div
                      key={n.id}
                      className={cn("group relative cursor-pointer p-4 transition-colors", !n.read_at ? "bg-primary/[0.025]" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30")}
                      onClick={() => openFromNotification(n)}
                    >
                      <div className="flex gap-3">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={senderName || "Usuário"} className="h-9 w-9 shrink-0 rounded-full border border-slate-100 object-cover dark:border-slate-800" />
                        ) : (
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {isMessage ? initialsOf(senderName) : <Bell className="h-4 w-4" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("truncate text-xs", !n.read_at ? "font-semibold" : "font-medium text-slate-600 dark:text-slate-400")}>{title}</p>
                            <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDistanceToNow(new Date(n.created_at), { addSuffix: false, locale: ptBR })}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-normal text-slate-400 dark:text-slate-500">{n.content}</p>
                          <div className="mt-2 flex items-center gap-3 opacity-0 transition group-hover:opacity-100">
                            {!n.read_at && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                                <CheckCircle2 className="h-3 w-3" /> Lida
                              </button>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); deleteNotif.mutate(n.id); }} className="flex items-center gap-1 text-[10px] font-bold text-rose-500/70 hover:text-rose-500 hover:underline">
                              <Trash2 className="h-3 w-3" /> Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <div className="df-notification-stack pointer-events-none fixed top-5 z-[1800] flex w-80 flex-col items-end gap-2">
        <AnimatePresence mode="popLayout">
          {popups.map((popup, index) => (
            <NotificationPopup
              key={popup.id}
              popup={popup}
              index={index}
              onClose={() => removePopup(popup.id)}
              onClick={() => {
                openFromNotification(popup);
                removePopup(popup.id);
              }}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function NotificationPopup({ popup, index, onClose, onClick }: { popup: PopupNotification; index: number; onClose: () => void; onClick: () => void }) {
  const duration = Math.max(2400, 5600 - index * 900);
  const meta = popup.metadata || {};
  const sender = meta.sender_name || popup.title || "DentalFlow";
  const isAttachment = popup.type === "attachment";

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_60px_-24px_rgba(15,23,42,.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
      onClick={onClick}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Fechar notificação">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex gap-3 pr-7">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          {isAttachment ? <Paperclip className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{sender}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{popup.content}</p>
        </div>
      </div>
      <motion.div className="absolute bottom-0 left-0 h-[2px] bg-primary/70" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: duration / 1000, ease: "linear" }} onAnimationComplete={onClose} />
    </motion.div>
  );
}
