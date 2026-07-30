import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, Trash2, CheckCheck } from 'lucide-react';
import { useNotificationPopups, type PopupNotification } from '@/hooks/use-notification-popups';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, adminDelete } from '@/lib/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';



type NotifFilter = 'all' | 'updates' | 'messages';

const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'updates', label: 'Atualizações' },
  { key: 'messages', label: 'Mensagens' },
];

const MESSAGE_TYPES = ['comment', 'attachment', 'mention', 'message'];
const UPDATE_TYPES = ['update', 'system', 'release'];

function matchesFilter(type: string | null | undefined, filter: NotifFilter) {
  if (filter === 'all') return true;
  const t = (type ?? '').toLowerCase();
  if (filter === 'messages') return MESSAGE_TYPES.includes(t);
  return UPDATE_TYPES.includes(t);
}

function initialsOf(name?: string | null) {
  const n = (name ?? '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotifFilter>('all');
  const { popups, unreadCount, removePopup, setUnreadCount } = useNotificationPopups();
  const queryClient = useQueryClient();



  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => adminDelete('notifications', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function openFromNotification(n: { id: string; read_at: string | null; type: string | null; metadata: any }) {
    if (!n.read_at) markRead.mutate(n.id);
    const meta = (n.metadata || {}) as { case_id?: string };
    const caseId = meta.case_id;
    const focus = n.type === 'comment' ? 'comments' : n.type === 'attachment' ? 'attachments' : 'overview';
    setIsOpen(false);
    if (caseId) {
      window.location.hash = `case=${caseId}&focus=${focus}`;
      window.dispatchEvent(new Event('hashchange'));
    }
  }



  const unreadDbCount = notifications.filter(n => !n.read_at).length;
  const displayCount = Math.max(unreadCount, unreadDbCount);

  return (
    <>
      <div className="hidden md:flex fixed top-6 right-6 z-[100] flex-col items-end gap-3 pointer-events-none">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <motion.button
              id="notification-trigger"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg border border-slate-100 dark:border-slate-800 transition-all text-slate-400 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              onClick={() => {
                setUnreadCount(0);
                const dummyAudio = new Audio();
                dummyAudio.play().catch(() => {});
              }}
            >
              <Bell className="h-5 w-5" />
              <AnimatePresence>
                {displayCount > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white border-2 border-white dark:border-slate-900"
                  >
                    {displayCount > 99 ? '99+' : displayCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] p-0 rounded-2xl border-slate-100 dark:border-slate-800 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl overflow-hidden">
            <div className="p-4 border-b border-slate-50 dark:border-slate-800/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadDbCount > 0 && (
                  <button
                    onClick={() => markAll.mutate()}
                    disabled={markAll.isPending}
                    className="text-[10px] font-bold text-primary uppercase tracking-[0.08em] hover:underline flex items-center gap-1"
                  >
                    <CheckCheck className="h-3 w-3" /> Marcar todas
                  </button>
                )}
                <span className="text-[10px] font-bold text-primary/60 uppercase tracking-[0.08em]">{notifications.length}</span>
              </div>
            </div>

            
            <ScrollArea className="h-[400px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-slate-50 dark:bg-slate-800/50 grid place-items-center">
                    <Bell className="h-6 w-6 text-slate-200 dark:text-slate-700" />
                  </div>
                  <p className="text-sm text-slate-400 font-light">Nenhuma notificação por aqui.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={cn(
                        "p-4 transition-colors group relative cursor-pointer",
                        !n.read_at ? "bg-primary/[0.02]" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      )}
                      onClick={() => openFromNotification(n as any)}
                    >
                      <div className="flex gap-3">

                        <div className={cn(
                          "h-8 w-8 shrink-0 rounded-lg flex items-center justify-center",
                          !n.read_at ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                        )}>
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn("text-xs leading-none", !n.read_at ? "font-semibold" : "font-medium text-slate-600 dark:text-slate-400")}>
                              {n.title}
                            </p>
                            <span className="text-[10px] text-slate-300 dark:text-slate-600 whitespace-nowrap">
                              {format(new Date(n.created_at), "HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal line-clamp-2">
                            {n.content}
                          </p>
                          <div className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.read_at && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Lida
                              </button>
                            )}
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteNotif.mutate(n.id); }}
                              className="text-[10px] font-bold text-rose-500/70 hover:text-rose-500 hover:underline flex items-center gap-1"
                            >
                              <Trash2 className="h-3 w-3" /> Excluir
                            </button>
                          </div>

                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <div className="flex flex-col items-end gap-2 w-80">
          <AnimatePresence mode="popLayout">
            {popups.map((popup, index) => (
              <NotificationPopup 
                key={popup.id} 
                popup={popup} 
                index={index} 
                onClose={() => removePopup(popup.id)} 
                onClick={() => {
                  openFromNotification(popup as any);
                  removePopup(popup.id);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}


function NotificationPopup({ 
  popup, 
  index, 
  onClose,
  onClick,
}: { 
  popup: PopupNotification; 
  index: number; 
  onClose: () => void;
  onClick?: () => void;
}) {
  const getDuration = () => {
    if (index === 0) return 5000;
    if (index === 1) return 3750;
    if (index === 2) return 2500;
    return 1250;
  };

  useEffect(() => {
    const timer = setTimeout(onClose, getDuration());
    return () => clearTimeout(timer);
  }, [onClose, index]); // Adicionado index para recalcular tempo se novas chegarem

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9, transition: { duration: 0.2 } }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className="pointer-events-auto w-full overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl cursor-pointer hover:border-primary/30 hover:shadow-primary/10 transition-colors relative"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <h4 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-none">{popup.title}</h4>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal">{popup.content}</p>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-full p-1 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-300 hover:text-slate-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <motion.div 
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: getDuration() / 1000, ease: "linear" }}
        className="absolute bottom-0 left-0 h-0.5 bg-primary/30"
      />
    </motion.div>
  );
}
