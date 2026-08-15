import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, Trash2, CheckCheck, MessageSquare, Image as ImageIcon, FileText } from 'lucide-react';
import { useNotificationPopups, type PopupNotification } from '@/hooks/use-notification-popups';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, adminDelete } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
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

export function NotificationPanel({ profile: externalProfile }: { profile?: Profile }) {
  const { data: profileData } = useQuery({ queryKey: ["profile"], queryFn: () => import('@/lib/api').then(m => m.fetchProfile()) });
  const profile = externalProfile ?? profileData;
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotifFilter>('all');
  const { popups, removePopup } = useNotificationPopups();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    staleTime: 300_000, // 5 minutos
    refetchInterval: 600_000, // 10 minutos (Realtime cuida das notificações)
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
    const meta = (n.metadata || {}) as { case_id?: string; activity_id?: string | null };
    const caseId = meta.case_id;
    const activityId = meta.activity_id;
    const focus = n.type === 'comment' ? 'comments' : n.type === 'attachment' ? 'attachments' : 'overview';
    setIsOpen(false);
    if (caseId) {
      const parts = [`case=${caseId}`, `focus=${focus}`];
      if (focus === 'comments') parts.push('tab=comentarios');
      if (activityId) parts.push(`msg=${activityId}`);
      window.location.hash = parts.join('&');
      window.dispatchEvent(new Event('hashchange'));
    }
  }

  const unreadDbCount = notifications.filter(n => !n.read_at).length;
  const displayCount = unreadDbCount;
  const filtered = notifications.filter((n: any) => matchesFilter(n.type, filter));

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <motion.button
            id="notification-trigger"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative h-10 w-10 grid place-items-center rounded-xl text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-primary transition-all focus:outline-none"
            aria-label="Notificações"
            onClick={() => {
              const dummyAudio = new Audio();
              dummyAudio.play().catch(() => {});
            }}
          >
            <Bell className="h-[21px] w-[21px] stroke-[1.4px]" />
            <AnimatePresence>
              {displayCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-950"
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
              <span className="text-[10px] font-bold text-primary/60 uppercase tracking-[0.08em]">{filtered.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ScrollArea className="h-[400px]">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-50 dark:bg-slate-800/50 grid place-items-center">
                  <Bell className="h-6 w-6 text-slate-200 dark:text-slate-700" />
                </div>
                <p className="text-sm text-slate-400 font-light">Nenhuma notificação por aqui.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {filtered.map((n: any) => {
                  const sender = n.sender ?? null;
                  const isMessage = MESSAGE_TYPES.includes((n.type ?? '').toLowerCase());
                  const senderName = n.metadata?.sender_name ?? sender?.full_name ?? sender?.email ?? null;
                  const avatarUrl = n.metadata?.sender_avatar ?? sender?.avatar_url;
                  
                  const title = isMessage && senderName
                    ? (n.type === 'attachment'
                        ? `${senderName} anexou um arquivo`
                        : `${senderName} comentou`)
                    : n.title;

                  return (
                    <div 
                      key={n.id} 
                      className={cn(
                        "p-4 transition-colors group relative cursor-pointer",
                        !n.read_at ? "bg-primary/[0.02]" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      )}
                      onClick={() => {
                        if (n.metadata?.action === 'approval_required') {
                          // Abre o dialog de detalhes do caso/solicitação
                          const parts = [`case=${n.metadata.case_id}`, `focus=overview`];
                          window.location.hash = parts.join('&');
                          window.dispatchEvent(new Event('hashchange'));
                          setIsOpen(false);
                        } else {
                          openFromNotification(n as any);
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        {isMessage ? (
                          avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={senderName ?? 'Usuário'}
                              className="h-9 w-9 shrink-0 rounded-full object-cover border border-slate-100 dark:border-slate-800"
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-[11px] font-semibold">
                              {initialsOf(senderName)}
                            </div>
                          )
                        ) : (
                          <div className={cn(
                            "h-9 w-9 shrink-0 rounded-full flex items-center justify-center",
                            !n.read_at ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                          )}>
                            <Bell className="h-4 w-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn("text-xs leading-tight truncate", !n.read_at ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-600 dark:text-slate-400")}>
                              {title}
                            </p>
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-[10px] text-slate-400">
                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: false, locale: ptBR })}
                              </span>
                              {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal line-clamp-2">
                            {n.content}
                          </p>
                          
                          {n.metadata?.action === 'approval_required' && !n.read_at && (
                            <div className="flex items-center gap-2 pt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Chamar acceptCaseRequest
                                  if (n.metadata?.case_id && profile?.id) {
                                    import('@/lib/api').then(({ acceptCaseRequest }) => {
                                      acceptCaseRequest(n.metadata.case_id, profile.id)
                                        .then(() => {
                                          toast.success("Solicitação aceita!");
                                          markRead.mutate(n.id);
                                        })
                                        .catch(() => toast.error("Erro ao aceitar solicitação."));
                                    });
                                  }
                                }}
                                className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 transition-opacity"
                              >
                                Aceitar
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Chamar reject (permanentDeleteCase ou similar)
                                  if (n.metadata?.case_id) {
                                    import('@/lib/api').then(({ permanentDeleteCase }) => {
                                      permanentDeleteCase(n.metadata.case_id)
                                        .then(() => {
                                          toast.success("Solicitação recusada.");
                                          markRead.mutate(n.id);
                                        })
                                        .catch(() => toast.error("Erro ao recusar solicitação."));
                                    });
                                  }
                                }}
                                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                Recusar
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.read_at && n.metadata?.action !== 'approval_required' && (
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
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col items-end gap-2 w-80 pointer-events-none fixed top-6 right-6 z-[100]">
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
  }, [onClose, index]);

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
        <div className="flex flex-col gap-3 shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="rounded-full p-1 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-300 hover:text-slate-600 transition-colors ml-auto"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {popup.metadata?.action === 'approval_required' && (
            <div className="flex flex-col gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  import('@/lib/api').then(({ fetchProfile, acceptCaseRequest, markNotificationAsRead }) => {
                    fetchProfile().then(profile => {
                      if (popup.metadata?.case_id && profile?.id) {
                        acceptCaseRequest(popup.metadata.case_id, profile.id)
                          .then(() => {
                            toast.success("Solicitação aceita!");
                            markNotificationAsRead(popup.id);
                            onClose();
                          })
                          .catch(() => toast.error("Erro ao aceitar solicitação."));
                      }
                    });
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 transition-opacity"
              >
                Aceitar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  import('@/lib/api').then(({ permanentDeleteCase, markNotificationAsRead }) => {
                    if (popup.metadata?.case_id) {
                      permanentDeleteCase(popup.metadata.case_id)
                        .then(() => {
                          toast.success("Solicitação recusada.");
                          markNotificationAsRead(popup.id);
                          onClose();
                        })
                        .catch(() => toast.error("Erro ao recusar solicitação."));
                    }
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Recusar
              </button>
            </div>
          )}
        </div>
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
