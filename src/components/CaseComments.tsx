import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Paperclip, Mic, X, Loader2, Smile } from "lucide-react";
import { toast } from "sonner";
import {
  fetchCaseActivity,
  addCaseActivity,
  deleteCaseActivity,
  fetchMentionableProfiles,
  notifyCaseStakeholders,
  fetchCaseStakeholderIds,
  type CaseActivity,
} from "@/lib/case-activity";
import { supabase } from "@/integrations/supabase/client";
import { uploadCaseAttachment, getCaseAttachmentUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmojiStickerPicker } from "./EmojiStickerPicker";
import { Sticker } from "./stickers";
import { Lightbox } from "./Lightbox";

type MentionItem = { id: string; full_name: string | null; email: string | null; role: string | null };
type PendingImage = { id: string; file: File; previewUrl: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function CaseComments({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  // stakeholders + profiles for "Visualizado por"
  const { data: stakeholders = [] } = useQuery({
    queryKey: ["case_stakeholders", caseId],
    queryFn: () => fetchCaseStakeholderIds(caseId),
  });
  const { data: readerProfiles = [] } = useQuery({
    queryKey: ["profiles_min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email, avatar_url");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[];
    },
  });
  const profileById = useMemo(
    () => new Map(readerProfiles.map((p) => [p.id, p] as const)),
    [readerProfiles],
  );

  // mention dropdown state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [pickedMentions, setPickedMentions] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["case_activity", caseId],
    queryFn: () => fetchCaseActivity(caseId),
    refetchInterval: 5000,
  });

  const activityIds = useMemo(() => activities.map((a) => a.id).filter((id) => !id.startsWith("optimistic-")), [activities]);
  const { data: reads = [] } = useQuery({
    queryKey: ["case_activity_reads", caseId, activityIds.length],
    queryFn: async () => {
      if (activityIds.length === 0) return [] as { activity_id: string; user_id: string }[];
      const { data, error } = await supabase
        .from("case_activity_reads" as never)
        .select("activity_id,user_id")
        .in("activity_id", activityIds);
      if (error) throw error;
      return (data ?? []) as unknown as { activity_id: string; user_id: string }[];
    },
    refetchInterval: 5000,
  });
  const readersByActivity = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of reads) {
      const arr = m.get(r.activity_id) ?? [];
      arr.push(r.user_id);
      m.set(r.activity_id, arr);
    }
    return m;
  }, [reads]);

  // Mark unread messages (from others) as read
  useEffect(() => {
    if (!me) return;
    const mine = new Set((reads.filter((r) => r.user_id === me)).map((r) => r.activity_id));
    const toMark = activities
      .filter((a) => a.kind === "comment" && a.user_id && a.user_id !== me && !a.id.startsWith("optimistic-") && !mine.has(a.id))
      .map((a) => ({ activity_id: a.id, user_id: me }));
    if (toMark.length === 0) return;
    (async () => {
      await supabase.from("case_activity_reads" as never).upsert(toMark as never, { onConflict: "activity_id,user_id" } as never);
      qc.invalidateQueries({ queryKey: ["case_activity_reads", caseId] });
    })();
  }, [activities, reads, me, caseId, qc]);

  useEffect(() => {
    const ch = supabase
      .channel(`case_activity_${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_activity", filter: `case_id=eq.${caseId}` }, () => {
        qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caseId, qc]);

  const { data: mentionOptions = [] } = useQuery({
    queryKey: ["mention_profiles", mentionQuery ?? ""],
    queryFn: () => fetchMentionableProfiles(mentionQuery ?? ""),
    enabled: mentionQuery !== null,
  });

  function onChange(value: string) {
    setText(value);
    const pos = taRef.current?.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const m = upto.match(/(?:^|\s)@([\w.\-@]*)$/);
    if (m) {
      setMentionStart(pos - m[1].length - 1);
      setMentionQuery(m[1]);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  }

  function insertAtCursor(snippet: string) {
    const ta = taRef.current;
    const pos = ta?.selectionStart ?? text.length;
    const next = text.slice(0, pos) + snippet + text.slice(pos);
    setText(next);
    setTimeout(() => {
      ta?.focus();
      const newPos = pos + snippet.length;
      ta?.setSelectionRange(newPos, newPos);
    }, 10);
  }

  function pickMention(opt: MentionItem) {
    const label = (opt.full_name || opt.email || "user").replace(/\s+/g, "_");
    const before = text.slice(0, mentionStart);
    const after = text.slice((taRef.current?.selectionStart ?? text.length));
    const newText = `${before}@${label} ${after}`;
    setText(newText);
    setPickedMentions((m) => ({ ...m, [label]: opt.id }));
    setMentionQuery(null);
    setMentionStart(-1);
    setTimeout(() => taRef.current?.focus(), 10);
  }

  function addImages(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const next = list.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    setPendingImages((s) => [...s, ...next]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function removePending(id: string) {
    setPendingImages((s) => {
      const found = s.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return s.filter((p) => p.id !== id);
    });
  }

  const send = useMutation({
    mutationFn: async (payload: { value: string; images: PendingImage[] }) => {
      const value = payload.value.trim();
      if (!value && payload.images.length === 0) return;

      const uploadedPaths: { path: string; name: string }[] = [];
      for (const p of payload.images) {
        const att = await uploadCaseAttachment(caseId, p.file, undefined, "comment_image");
        uploadedPaths.push({ path: att.storage_path, name: att.file_name });
      }

      const mentionedLabels = Array.from(value.matchAll(/@([\w.\-@]+)/g)).map((mm) => mm[1]);
      const mentionIds = Array.from(new Set(mentionedLabels.map((l) => pickedMentions[l]).filter(Boolean))) as string[];

      const metadata: Record<string, unknown> = {};
      if (uploadedPaths.length) metadata.images = uploadedPaths;

      await addCaseActivity(caseId, "comment", value || "(imagem)", mentionIds, metadata);
      await notifyCaseStakeholders({
        caseId,
        title: "Novo comentário no caso",
        content: (value || "(imagem)").length > 140 ? (value || "(imagem)").slice(0, 140) + "…" : (value || "(imagem)"),
        type: "comment",
        extraRecipientIds: mentionIds,
      });
    },
    onMutate: async (payload: { value: string; images: PendingImage[] }) => {
      const value = payload.value.trim();
      if (!value && payload.images.length === 0) return;
      await qc.cancelQueries({ queryKey: ["case_activity", caseId] });
      const previous = qc.getQueryData<CaseActivity[]>(["case_activity", caseId]);
      const tempId = `optimistic-${Date.now()}`;
      const optimisticImages = payload.images.map((p) => ({ path: p.previewUrl, name: p.file.name }));
      // Pre-populate signedUrls so previews render instantly
      if (optimisticImages.length) {
        setSignedUrls((prev) => {
          const next = { ...prev };
          for (const img of optimisticImages) next[img.path] = img.path;
          return next;
        });
      }
      const optimistic: CaseActivity = {
        id: tempId,
        case_id: caseId,
        user_id: me ?? "",
        kind: "comment",
        content: value || "(imagem)",
        created_at: new Date().toISOString(),
        metadata: optimisticImages.length ? { images: optimisticImages } : null,
        user: { id: me ?? "", full_name: null, email: null, role: null },
      } as unknown as CaseActivity;
      qc.setQueryData<CaseActivity[]>(["case_activity", caseId], (old = []) => [...old, optimistic]);
      // Clear composer immediately for optimistic UX
      setText("");
      setPickedMentions({});
      setPendingImages([]);
      return { previous, tempId };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(["case_activity", caseId], ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      qc.invalidateQueries({ queryKey: ["case_attachments", caseId] });
    },
  });

  function submitMessage() {
    if (send.isPending) return;
    if (!text.trim() && pendingImages.length === 0) return;
    send.mutate({ value: text, images: pendingImages });
  }

  const remove = useMutation({
    mutationFn: (id: string) => deleteCaseActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case_activity", caseId] }),
  });

  // ascending order for chat
  const sorted = useMemo(
    () => [...activities].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [activities],
  );
  const visible = useMemo(
    () => sorted.filter((a) => a.kind === "comment"),
    [sorted],
  );

  // signed urls for comment images
  useEffect(() => {
    const pending: { path: string; name: string }[] = [];
    for (const a of sorted) {
      const imgs = (a.metadata as { images?: { path: string; name: string }[] } | null)?.images ?? [];
      for (const img of imgs) {
        if (!signedUrls[img.path]) pending.push(img);
      }
    }
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(pending.map(async (img) => {
        try { out[img.path] = await getCaseAttachmentUrl(img.path); } catch { /* ignore */ }
      }));
      if (!cancelled) setSignedUrls((prev) => ({ ...prev, ...out }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  // auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [visible.length]);

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1"
      >
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
        )}
        {!isLoading && visible.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-10">
            Nenhuma mensagem ainda. Diga algo abaixo 👋
          </div>
        )}

        {me !== undefined && visible.map((a, idx) => {
          const prev = visible[idx - 1];
          const next = visible[idx + 1];
          const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(a.created_at);
          if (a.kind !== "comment") {
            return (
              <div key={a.id}>
                {showDay && <DaySeparator label={dayLabel(a.created_at)} />}
                <SystemEvent activity={a} />
              </div>
            );
          }
          const isMine = !!me && a.user_id === me;
          const name = a.user?.full_name || a.user?.email || "Sistema";
          const images = (a.metadata as { images?: { path: string; name: string }[] } | null)?.images ?? [];
          const visibleImages = images
            .map((img) => ({ url: signedUrls[img.path], name: img.name }))
            .filter((x) => !!x.url);
          const groupedWithPrev =
            prev && prev.kind === "comment" && prev.user_id === a.user_id &&
            !showDay &&
            (new Date(a.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60_000;
          const nextShowsDay = next && dayLabel(a.created_at) !== dayLabel(next.created_at);
          const groupedWithNext =
            next && next.kind === "comment" && next.user_id === a.user_id &&
            !nextShowsDay &&
            (new Date(next.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60_000;
          const isLastOfGroup = !groupedWithNext;

          return (
            <div key={a.id}>
              {showDay && <DaySeparator label={dayLabel(a.created_at)} />}
              <div className={cn(
                "flex items-start gap-3 animate-fade-in",
                isMine ? "justify-end" : "justify-start",
                groupedWithPrev ? "mt-1" : "mt-4",
              )}>
                {!isMine && (() => {
                  const p = profileById.get(a.user_id ?? "");
                  const url = p?.avatar_url ?? null;
                  return (
                    <div className={cn(
                      "order-1 h-14 w-14 shrink-0 rounded-full grid place-items-center text-[13px] font-semibold text-slate-500 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 overflow-hidden self-end",
                      groupedWithPrev && "invisible"
                    )}>
                      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : initials(name)}
                    </div>
                  );
                })()}
                <div className={cn("order-2 max-w-[68%] flex flex-col", isMine ? "items-end" : "items-start")}>
                  {!groupedWithPrev && (
                    <span className="text-[15px] text-slate-500 dark:text-slate-400 px-2 mb-1.5">{name}</span>
                  )}
                  <ChatBubble isMine={isMine} tail={!groupedWithPrev} time={hhmm(a.created_at)}>

                    {a.content && a.content !== "(imagem)" && (
                      <div>{renderContent(a.content)}</div>
                    )}
                    {visibleImages.length > 0 && (
                      <div className={cn(
                        "flex flex-wrap gap-1.5",
                        a.content && a.content !== "(imagem)" && "mt-2"
                      )}>
                        {visibleImages.map((img, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightbox({ images: visibleImages, index: i })}
                            className="h-28 w-28 rounded-2xl overflow-hidden border border-black/5 bg-muted hover:opacity-90 transition"
                          >
                            <img src={img.url} alt={img.name} loading="lazy" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </ChatBubble>
                  {isLastOfGroup && (
                    <span className={cn(
                      "text-[12px] text-slate-400 dark:text-slate-500 mt-1.5 px-2 flex items-center gap-1.5",
                      isMine ? "text-right justify-end" : "text-left"
                    )}>

                      {isMine && (() => {
                        const expected = stakeholders.filter((id) => id !== me);
                        const readers = (readersByActivity.get(a.id) ?? []).filter((id) => id !== me);
                        if (expected.length === 0) return null;
                        const readerSet = new Set(readers);
                        const allRead = expected.every((id) => readerSet.has(id));
                        if (allRead) {
                          return <span>· Visualizado por <span className="font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">TODOS</span></span>;
                        }
                        if (readers.length === 0) return null;
                        return (
                          <span className="flex items-center gap-1">
                            <span>· Visualizado por</span>
                            <span className="flex -space-x-1.5">
                              {readers.slice(0, 4).map((rid) => {
                                const p = profileById.get(rid);
                                const nm = p?.full_name || p?.email || "?";
                                return p?.avatar_url ? (
                                  <img key={rid} src={p.avatar_url} alt={nm}
                                    className="h-4 w-4 rounded-full border border-white object-cover" />
                                ) : (
                                  <span key={rid}
                                    className="h-4 w-4 rounded-full border border-white bg-slate-300 text-[8px] font-semibold text-slate-600 dark:text-slate-300 grid place-items-center">
                                    {initials(nm)}
                                  </span>
                                );
                              })}
                            </span>
                          </span>
                        );
                      })()}
                    </span>
                  )}
                </div>
                {isMine && (() => {
                  const p = profileById.get(a.user_id ?? "");
                  const url = p?.avatar_url ?? null;
                  return (
                    <div className={cn(
                      "order-3 h-14 w-14 shrink-0 rounded-full grid place-items-center text-[13px] font-semibold text-slate-500 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 overflow-hidden self-end",
                      groupedWithPrev && "invisible"
                    )}>
                      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : initials(name)}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer estilo referência: pill + botão azul */}
      <div className="mt-3 relative">
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingImages.map((p) => (
              <div key={p.id} className="relative h-16 w-16 rounded-lg border border-border overflow-hidden bg-muted">
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePending(p.id)}
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {mentionQuery !== null && mentionOptions.length > 0 && (
          <div className="absolute left-3 right-3 bottom-full mb-2 z-30 max-h-52 overflow-auto rounded-xl border bg-popover shadow-lg">
            {mentionOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pickMention(o as MentionItem)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-center justify-between gap-2"
              >
                <span className="font-medium truncate">{o.full_name || o.email}</span>
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{o.role}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-14 rounded-full bg-[#f1f1f3] dark:bg-slate-800 flex items-center pl-4 pr-3 gap-2">
            <button
              type="button"
              aria-label="Emoji"
              onClick={() => setShowEmoji((s) => !s)}
              className="h-9 w-9 rounded-full grid place-items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-white/60 transition"
            >
              <Smile className="h-5 w-5" />
            </button>
            <Textarea
              ref={taRef}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitMessage();
                }
              }}
              placeholder="Mensagem"
              rows={1}
              className="flex-1 text-[15px] resize-none border-0 focus-visible:ring-0 bg-transparent shadow-none px-0 py-0 min-h-0 h-6 leading-6 placeholder:text-slate-400 dark:text-slate-500"
            />
            <button
              type="button"
              aria-label="Anexar"
              onClick={() => imageInputRef.current?.click()}
              className="h-9 w-9 rounded-full grid place-items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-white/60 transition"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => addImages(e.target.files)} />
          </div>
          <button
            type="button"
            onClick={submitMessage}
            disabled={send.isPending || (!text.trim() && pendingImages.length === 0)}
            aria-label={text.trim() || pendingImages.length ? "Enviar" : "Gravar áudio"}
            className="h-14 w-14 shrink-0 rounded-full bg-[#1F8AFF] hover:bg-[#1877E8] text-white grid place-items-center shadow-md transition disabled:opacity-60"
          >
            {send.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : text.trim() || pendingImages.length ? (
              <Send className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
        </div>
        {showEmoji && (
          <div className="absolute left-0 bottom-full mb-2 z-30">
            <EmojiStickerPicker
              onPickEmoji={(e) => { insertAtCursor(e); setShowEmoji(false); }}
              onPickSticker={(id) => { insertAtCursor(`:sticker/${id}:`); setShowEmoji(false); }}
            />
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox
          open
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((s) => s ? { ...s, index: i } : s)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground px-2 py-1 rounded-full bg-muted/40 border border-border/40">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function SystemEvent({ activity }: { activity: CaseActivity }) {
  const name = activity.user?.full_name || activity.user?.email || "Sistema";
  return (
    <div className="flex items-center justify-center my-1.5">
      <div className="text-[10px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-full border border-border/40">
        <span className="font-semibold">{name}</span> · {activity.kind.replace("_", " ")} · {hhmm(activity.created_at)}
      </div>
    </div>
  );
}

function renderContent(text: string) {
  const parts = text.split(/(@[\w.\-@]+|:sticker\/[a-z_]+:)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) return <span key={i} className="font-semibold underline decoration-current/30 underline-offset-2">{p}</span>;
    const m = p.match(/^:sticker\/([a-z_]+):$/);
    if (m) return <span key={i} className="inline-block align-middle mx-0.5"><Sticker id={m[1]} size={64} /></span>;
    return <span key={i}>{p}</span>;
  });
}

function ChatBubble({ isMine, tail, children }: { isMine: boolean; tail?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [singleLine, setSingleLine] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight || "0");
      // considera "linha única" quando o conteúdo cabe em ~1 linha (com folga p/ padding)
      setSingleLine(!!lh && el.scrollHeight <= lh * 1.6);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  // Raio grande padrão vs "ponta" (canto adjacente ao avatar) — usa CSS inline
  // para evitar conflito de cascade entre rounded-full e rounded-br-sm.
  const big = singleLine ? 999 : 22;
  const tip = 6;
  const style: React.CSSProperties = {
    borderTopLeftRadius: tail && !isMine ? tip : big,
    borderTopRightRadius: tail && isMine ? tip : big,
    borderBottomLeftRadius: big,
    borderBottomRightRadius: big,
  };

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "px-5 py-3 text-[16px] leading-[1.45] shadow-sm break-words whitespace-pre-wrap max-w-full",
        isMine
          ? "bg-[#1F8AFF] text-white"
          : "bg-slate-100 dark:bg-slate-800 text-slate-800",
      )}
    >
      {children}
    </div>
  );
}
