import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CaseChecklistFab } from "@/components/CaseChecklists";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Paperclip, Mic, X, Smile, Loader2, Square, Pencil, ScanLine, FileCode2, Layers, Box, Image as ImageIcon, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestAttachmentFocus } from "@/lib/attachment-focus";
import { toast } from "sonner";
import {
  fetchCaseActivity,
  addCaseActivity,
  deleteCaseActivity,
  fetchMentionableProfiles,
  notifyCaseStakeholders,
  type CaseActivity,
} from "@/lib/case-activity";
import { supabase } from "@/integrations/supabase/client";
import { uploadCaseAttachment, getCaseAttachmentUrl, markCaseNotificationsRead } from "@/lib/api";
import { ReadReceipts, type Reader } from "./ReadReceipts";
import { cn } from "@/lib/utils";
import { EmojiStickerPicker } from "./EmojiStickerPicker";
import { Sticker } from "./stickers";
import { Lightbox } from "./Lightbox";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { ImageEditorDialog } from "./ImageEditorDialog";


type MentionItem = { id: string; full_name: string | null; email: string | null; role: string | null };
type PendingImage = { id: string; file: File; previewUrl: string; kind?: "comment_image" | "gallery" };

/** Tipos de anexo que podem ser enviados pelo chat (mapeiam para as abas do caso). */
export type AttachKind = "gallery" | "scans" | "exocad_html" | "model" | "fabrication";

const ATTACH_LABEL: Record<AttachKind, string> = {
  gallery: "Imagem",
  scans: "Escaneamento",
  exocad_html: "HTML",
  model: "Modelo",
  fabrication: "Elemento",
};

const ATTACH_ACCEPT: Record<AttachKind, string> = {
  gallery: "image/*",
  scans: ".stl,.ply,.dcm,.obj,.3mf,.zip",
  exocad_html: ".html,.htm",
  model: ".stl,.obj,.3mf,.ply,.dcm,.zip",
  fabrication: ".stl,.obj,.zip,.3mf,.ply,.dcm",
};

function AttachKindIcon({ kind, className }: { kind: AttachKind; className?: string }) {
  if (kind === "scans") return <ScanLine className={className} />;
  if (kind === "exocad_html") return <FileCode2 className={className} />;
  if (kind === "fabrication") return <Layers className={className} />;
  if (kind === "gallery") return <ImageIcon className={className} />;
  return <Box className={className} />;
}

function fmtBytes(b?: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}


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

// Remembers the chat scroll offset per case while the app session lasts
const chatScrollMemory = new Map<string, number>();



export function CaseComments({ caseId, focusActivityId = null }: { caseId: string; focusActivityId?: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // auto-crescimento do campo de mensagem (até ~4 linhas, depois scroll)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 216)}px`;
  }, [text]);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File; kind: AttachKind }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileKindRef = useRef<AttachKind>("model");
  const imageKindRef = useRef<"comment_image" | "gallery">("comment_image");
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const recorder = useAudioTranscription();


  // profiles para "Visualizado por"
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
  // A chave NÃO inclui os ids: se incluísse, cada mensagem nova criaria uma
  // query nova (sem cache) e o chat voltaria ao estado "carregando".
  const activityIdsRef = useRef<string[]>([]);
  activityIdsRef.current = activityIds;
  const { data: reads = [], isFetched: readsFetched } = useQuery({
    queryKey: ["case_activity_reads", caseId],
    queryFn: async () => {
      const ids = activityIdsRef.current;
      if (ids.length === 0) return [] as { activity_id: string; user_id: string; created_at: string }[];
      const { data, error } = await supabase
        .from("case_activity_reads" as never)
        .select("activity_id,user_id,created_at")
        .in("activity_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as { activity_id: string; user_id: string; created_at: string }[];
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
  // Horário da visualização por (mensagem + usuário)
  const readAtByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reads) m.set(`${r.activity_id}:${r.user_id}`, r.created_at);
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
      // O "relacionado" foi visto aqui: derruba na hora as notificações de
      // mensagem/menção deste caso na central de notificações.
      const ids = await markCaseNotificationsRead(caseId, ["comment", "mention", "message"]);
      if (ids.length > 0) {
        const nowIso = new Date().toISOString();
        const idSet = new Set(ids);
        qc.setQueryData(["notifications"], (old: any) =>
          Array.isArray(old) ? old.map((n: any) => (idSet.has(n.id) ? { ...n, read_at: n.read_at ?? nowIso } : n)) : old,
        );
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
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

  function addImages(files: FileList | null, kind: "comment_image" | "gallery" = "comment_image") {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const next = list.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      kind,
    }));
    setPendingImages((s) => [...s, ...next]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function addFiles(files: FileList | null, kind: AttachKind) {
    if (!files) return;
    const next = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      kind,
    }));
    setPendingFiles((s) => [...s, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingFile(id: string) {
    setPendingFiles((s) => s.filter((p) => p.id !== id));
  }


  function removePending(id: string) {
    setPendingImages((s) => {
      const found = s.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return s.filter((p) => p.id !== id);
    });
  }

  // ---- Outgoing queue: multiple messages can be in flight at once ----
  type OutFile = { id: string; file: File; kind: AttachKind };
  const [outgoing, setOutgoing] = useState<
    { id: string; value: string; images: PendingImage[]; files: OutFile[]; created_at: string; failed?: boolean }[]
  >([]);

  async function sendOne(item: { id: string; value: string; images: PendingImage[]; files: OutFile[]; created_at: string }) {
    try {
      const value = item.value.trim();
      const uploadedPaths: { path: string; name: string; att_id?: string; kind?: string }[] = [];
      for (const p of item.images) {
        const att = await uploadCaseAttachment(caseId, p.file, undefined, p.kind ?? "comment_image");
        uploadedPaths.push({ path: att.storage_path, name: att.file_name, att_id: att.id, kind: p.kind ?? "comment_image" });
      }
      const uploadedFiles: { att_id: string; name: string; size: number; kind: AttachKind }[] = [];
      for (const f of item.files) {
        const att = await uploadCaseAttachment(caseId, f.file, undefined, f.kind);
        uploadedFiles.push({ att_id: att.id, name: att.file_name, size: f.file.size, kind: f.kind });
      }

      const mentionedLabels = Array.from(value.matchAll(/@([\w.\-@]+)/g)).map((mm) => mm[1]);
      const mentionIds = Array.from(new Set(mentionedLabels.map((l) => pickedMentions[l]).filter(Boolean))) as string[];

      const metadata: Record<string, unknown> = {};
      if (uploadedPaths.length) metadata.images = uploadedPaths;
      if (uploadedFiles.length) metadata.files = uploadedFiles;

      const fallback = uploadedFiles.length ? "(anexo)" : "(imagem)";
      const created = await addCaseActivity(caseId, "comment", value || fallback, mentionIds, metadata);

      // Make the real message visible everywhere as fast as possible
      await qc.refetchQueries({ queryKey: ["case_activity", caseId] });
      setOutgoing((s) => s.filter((o) => o.id !== item.id));
      for (const p of item.images) URL.revokeObjectURL(p.previewUrl);

      notifyCaseStakeholders({
        activityId: (created as { id?: string } | null)?.id,
        caseId,
        title: "Novo comentário no caso",
        content: (value || fallback).length > 140 ? (value || fallback).slice(0, 140) + "…" : (value || fallback),
        type: "comment",
        extraRecipientIds: mentionIds,
      }).catch(() => { /* notification failure must not block the chat */ });

      qc.invalidateQueries({ queryKey: ["case_attachments", caseId] });
    } catch (e) {
      setOutgoing((s) => s.map((o) => (o.id === item.id ? { ...o, failed: true } : o)));
      toast.error((e as Error).message);
    }
  }

  function submitMessage() {
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    const item = {
      id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      value: text,
      images: pendingImages,
      files: pendingFiles,
      created_at: new Date().toISOString(),
    };
    setOutgoing((s) => [...s, item]);
    setText("");
    setPickedMentions({});
    setPendingImages([]);
    setPendingFiles([]);

    void sendOne(item);
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
  const visible = useMemo(() => {
    const server = sorted.filter((a) => a.kind === "comment");
    if (outgoing.length === 0) return server;
    const prof = profileById.get(me ?? "");
    const pending = outgoing.map((o) => ({
      id: o.id,
      case_id: caseId,
      user_id: me ?? "",
      kind: "comment",
      content: o.value.trim() || (o.files.length ? "(anexo)" : "(imagem)"),
      created_at: o.created_at,
      metadata: {
        ...(o.images.length ? { images: o.images.map((p) => ({ path: p.previewUrl, name: p.file.name })) } : {}),
        ...(o.files.length
          ? { files: o.files.map((f) => ({ att_id: "", name: f.file.name, size: f.file.size, kind: f.kind })) }
          : {}),
      },
      user: { id: me ?? "", full_name: prof?.full_name ?? null, email: prof?.email ?? null, role: null },
    })) as unknown as CaseActivity[];
    return [...server, ...pending];
  }, [sorted, outgoing, me, caseId, profileById]);

  // ---- Janela de mensagens: começa pelas mais recentes, carrega antigas ao rolar ----
  const PAGE = 30;
  const [windowSize, setWindowSize] = useState(PAGE);
  useEffect(() => { setWindowSize(PAGE); }, [caseId]);
  const [loadingOlder, setLoadingOlder] = useState(false);


  // local blob previews resolve to themselves
  useEffect(() => {
    if (outgoing.length === 0) return;
    setSignedUrls((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const o of outgoing) {
        for (const p of o.images) {
          if (!next[p.previewUrl]) { next[p.previewUrl] = p.previewUrl; changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [outgoing]);
  const outgoingIds = useMemo(() => new Set(outgoing.map((o) => o.id)), [outgoing]);


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

  // Busca as leituras novamente quando surgem mensagens novas (chave estável).
  useEffect(() => {
    if (activityIds.length === 0) return;
    void qc.refetchQueries({ queryKey: ["case_activity_reads", caseId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityIds.join(",")]);

  // Pronto para posicionar (perfil, mensagens e leituras carregados).
  // "Sticky": uma vez pronto, nunca volta a exibir o carregamento — mensagens
  // novas não devem re-disparar o overlay nem reposicionar a rolagem.
  const readyOnceRef = useRef(false);
  const readyCaseRef = useRef(caseId);
  if (readyCaseRef.current !== caseId) {
    readyCaseRef.current = caseId;
    readyOnceRef.current = false;
  }
  if (me !== undefined && !isLoading && readsFetched) readyOnceRef.current = true;
  const ready = readyOnceRef.current;

  // Freeze the first unread message (from others) when the chat first opens
  const firstUnreadRef = useRef<string | null | undefined>(undefined);
  if (firstUnreadRef.current === undefined && ready) {
    const mine = new Set(reads.filter((r) => r.user_id === me).map((r) => r.activity_id));
    const first = visible.find(
      (a) => a.user_id && a.user_id !== me && !a.id.startsWith("optimistic-") && !mine.has(a.id),
    );
    firstUnreadRef.current = first?.id ?? null;
  }
  const firstUnreadId = firstUnreadRef.current ?? null;

  // Mensagens renderizadas: últimas `windowSize`, garantindo o divider de não lidas
  // e a mensagem alvo de notificação dentro da janela.
  const windowed = useMemo(() => {
    let size = windowSize;
    const ensure = (id: string | null) => {
      if (!id) return;
      const idx = visible.findIndex((a) => a.id === id);
      if (idx >= 0) size = Math.max(size, visible.length - idx + 5);
    };
    ensure(firstUnreadId);
    ensure(focusActivityId ?? null);
    return visible.slice(Math.max(0, visible.length - size));
  }, [visible, windowSize, firstUnreadId, focusActivityId]);
  const hasOlder = windowed.length < visible.length;

  // Initial positioning: notification deep link > first unread > bottom
  const initialScrollDoneRef = useRef(false);
  const focusDoneRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !ready || windowed.length === 0) return;

    const scrollToEl = (el: HTMLElement, center: boolean) => {
      const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTop += center
        ? delta - container.clientHeight / 2 + el.clientHeight / 2
        : delta - 16;
    };

    if (focusActivityId && focusDoneRef.current !== focusActivityId) {
      const el = container.querySelector(`[data-activity-id="${focusActivityId}"]`) as HTMLElement | null;
      if (!el) return;
      focusDoneRef.current = focusActivityId;
      initialScrollDoneRef.current = true;
      scrollToEl(el, true);
      el.classList.add("df-msg-focus");
      const t = setTimeout(() => el.classList.remove("df-msg-focus"), 2600);
      return () => clearTimeout(t);
    }

    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;

      // Abrir o chat: se houver mensagens não lidas, começar no divider;
      // caso contrário, ir direto para a mensagem mais recente (fim da rolagem).
      const place = () => {
        if (firstUnreadId) {
          const el = container.querySelector(`[data-unread-divider="true"]`) as HTMLElement | null;
          if (el) {
            scrollToEl(el, false);
            return;
          }
        }
        container.scrollTop = container.scrollHeight;
      };
      // repete por alguns frames: imagens/avatares mudam a altura depois do 1º layout
      place();
      const timers = [16, 60, 150, 320, 600].map((ms) => setTimeout(place, ms));
      return () => timers.forEach(clearTimeout);
    }

  }, [focusActivityId, windowed, firstUnreadId, caseId, ready]);

  // Carregar mensagens antigas ao rolar para o topo (estilo WhatsApp)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !initialScrollDoneRef.current) return;
    const onScroll = () => {
      if (el.scrollTop > 80 || !hasOlder || loadingOlder) return;
      const prevHeight = el.scrollHeight;
      setLoadingOlder(true);
      setWindowSize((s) => s + PAGE);
      requestAnimationFrame(() => {
        el.scrollTop += el.scrollHeight - prevHeight;
        setLoadingOlder(false);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasOlder, loadingOlder, ready]);



  // Persist scroll position so returning to the chat tab resumes where it was
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { chatScrollMemory.set(caseId, el.scrollTop); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      chatScrollMemory.set(caseId, el.scrollTop);
    };
  }, [caseId]);

  // keep pinned to the bottom for new content
  const lastCountRef = useRef(0);
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !initialScrollDoneRef.current) return;
    const grew = visible.length > lastCountRef.current;
    lastCountRef.current = visible.length;
    const last = visible[visible.length - 1];
    const isNewMessage = !!last && last.id !== lastIdRef.current;
    lastIdRef.current = last?.id ?? null;

    const pin = () => {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      setTimeout(() => { el.scrollTop = el.scrollHeight; }, 120);
    };

    // A brand new message arrived (from anyone) while the chat is open: reveal it fully
    if (grew && isNewMessage) {
      pin();
      return;
    }
    if (focusActivityId && focusDoneRef.current === focusActivityId) return;
    if (firstUnreadId) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (!nearBottom) return;
    pin();
  }, [visible, signedUrls, focusActivityId, firstUnreadId]);


  return (
    <div className="flex flex-col h-full min-h-[420px] relative">
      <CaseChecklistFab caseId={caseId} />

      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <span className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-[13px] font-light">Carregando mensagens…</span>
        </div>
      )}
      {/* Messages */}

      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1 transition-opacity duration-300",
          ready ? "opacity-100" : "opacity-0",
        )}
      >
        {hasOlder && (
          <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
            <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Carregando mensagens anteriores…
          </div>
        )}
        {ready && windowed.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-10">
            Nenhuma mensagem ainda. Diga algo abaixo 👋
          </div>
        )}

        {ready && windowed.map((a, idx) => {
          const prev = windowed[idx - 1];
          const next = windowed[idx + 1];

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
          const prof = profileById.get(a.user_id ?? "");
          const name =
            a.user?.full_name || prof?.full_name || a.user?.email || prof?.email || (isMine ? "Você" : "Sistema");
          const images = (a.metadata as { images?: { path: string; name: string }[] } | null)?.images ?? [];
          const attFiles =
            (a.metadata as { files?: { att_id: string; name: string; size: number; kind: AttachKind }[] } | null)
              ?.files ?? [];
          const visibleImages = images
            .map((img) => ({ url: signedUrls[img.path], name: img.name }))
            .filter((x) => !!x.url);
          const groupedWithPrev =
            !!prev && prev.kind === "comment" && (prev.user_id ?? "") === (a.user_id ?? "") && !showDay;
          const nextShowsDay = !!next && dayLabel(a.created_at) !== dayLabel(next.created_at);
          const groupedWithNext =
            !!next && next.kind === "comment" && (next.user_id ?? "") === (a.user_id ?? "") && !nextShowsDay;
          const isLastOfGroup = !groupedWithNext;

          const isSending = outgoingIds.has(a.id);
          return (
            <div key={a.id} data-activity-id={a.id} className={cn(
              "rounded-2xl transition-all duration-500",
              isSending && "opacity-55",
            )}>

              {showDay && <DaySeparator label={dayLabel(a.created_at)} />}
              {firstUnreadId === a.id && <UnreadDivider />}
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
                  {!groupedWithPrev && !isMine && (
                    <span className="text-[15px] text-slate-500 dark:text-slate-400 px-2 mb-1.5">{name}</span>
                  )}
                  <ChatBubble isMine={isMine} tail={!groupedWithPrev} time={hhmm(a.created_at)}>

                    {a.content && a.content !== "(imagem)" && a.content !== "(anexo)" && (
                      <div>{renderContent(a.content)}</div>
                    )}
                    {attFiles.length > 0 && (
                      <div className={cn(
                        "flex flex-col gap-1.5",
                        a.content && a.content !== "(imagem)" && a.content !== "(anexo)" && "mt-2",
                      )}>
                        {attFiles.map((f, i) => (
                          <button
                            key={`${f.att_id}-${i}`}
                            type="button"
                            disabled={!f.att_id}
                            onClick={() => requestAttachmentFocus({ caseId, kind: f.kind, attachmentId: f.att_id })}
                            className={cn(
                              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition w-[240px] max-w-full",
                              isMine ? "bg-white/15 hover:bg-white/25" : "bg-black/[0.05] dark:bg-white/10 hover:bg-black/[0.09] dark:hover:bg-white/15",
                            )}
                            title={f.att_id ? "Abrir na aba do caso" : "Enviando…"}
                          >
                            <span className={cn(
                              "h-10 w-10 shrink-0 rounded-xl grid place-items-center",
                              isMine ? "bg-white/20" : "bg-primary/10 text-primary",
                            )}>
                              <AttachKindIcon kind={f.kind} className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[10px] uppercase tracking-[0.08em] opacity-70">
                                {ATTACH_LABEL[f.kind]}
                              </span>
                              <span className="block text-[13px] font-medium truncate">{f.name}</span>
                              <span className="block text-[11px] opacity-70">{fmtBytes(f.size)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {visibleImages.length > 0 && (
                      <div className={cn(
                        "flex flex-wrap gap-1.5",
                        (attFiles.length > 0 || (a.content && a.content !== "(imagem)" && a.content !== "(anexo)")) && "mt-2"
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
                  {isLastOfGroup && isMine && (
                    <span className={cn(
                      "text-[12px] text-slate-400 dark:text-slate-500 mt-1.5 px-2 flex items-center gap-1.5",
                      isMine ? "text-right justify-end" : "text-left"
                    )}>

                      {isMine && (() => {
                        const readerIds = (readersByActivity.get(a.id) ?? []).filter((id) => id !== me);
                        if (readerIds.length === 0) return null;
                        const readers: Reader[] = readerIds.map((rid) => {
                          const p = profileById.get(rid);
                          return {
                            id: rid,
                            name: p?.full_name || p?.email || "Usuário",
                            avatarUrl: p?.avatar_url ?? null,
                            readAt: readAtByKey.get(`${a.id}:${rid}`) ?? null,
                          };
                        });
                        return <ReadReceipts readers={readers} />;
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
              <div key={p.id} className="relative h-16 w-16 rounded-lg border border-border overflow-hidden bg-muted group">
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePending(p.id)}
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80">
                  <X className="h-3 w-3" />
                </button>
                <button type="button" aria-label="Editar imagem" onClick={() => setEditingImage(p.id)}
                  className="absolute bottom-0.5 left-0.5 h-5 w-5 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((p) => (
              <div key={p.id} className="relative flex items-center gap-2 rounded-xl border border-border bg-muted/60 pl-2.5 pr-8 py-2 max-w-[240px]">
                <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-primary/10 text-primary">
                  <AttachKindIcon kind={p.kind} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{ATTACH_LABEL[p.kind]}</span>
                  <span className="block text-[12px] font-medium truncate">{p.file.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{fmtBytes(p.file.size)}</span>
                </span>
                <button type="button" onClick={() => removePendingFile(p.id)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/50 text-white grid place-items-center hover:bg-black/70">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <ImageEditorDialog
          open={!!editingImage}
          file={pendingImages.find((p) => p.id === editingImage)?.file ?? null}
          mode="free"
          outputSize={1080}
          title="Editar imagem"
          onCancel={() => setEditingImage(null)}
          onConfirm={(blob) => {
            const id = editingImage;
            setEditingImage(null);
            if (!id) return;
            setPendingImages((s) =>
              s.map((p) => {
                if (p.id !== id) return p;
                URL.revokeObjectURL(p.previewUrl);
                const file = new File([blob], p.file.name.replace(/\.\w+$/, "") + "-editada.jpg", { type: "image/jpeg" });
                return { ...p, file, previewUrl: URL.createObjectURL(file) };
              }),
            );
          }}
        />

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
          {recorder.state !== "idle" ? (
            <RecordingBar
              seconds={recorder.seconds}
              transcribing={recorder.state === "transcribing"}
              onCancel={recorder.cancel}
            />
          ) : (
          <div className="flex-1 min-h-14 rounded-3xl bg-[#f1f1f3] dark:bg-slate-800 flex items-end pl-4 pr-3 gap-2 py-2.5">

            <button
              type="button"
              aria-label="Emoji"
              onClick={() => setShowEmoji((s) => !s)}
              className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-white/60 transition"
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
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
                if (files.length === 0) return;
                e.preventDefault();
                const dt = new DataTransfer();
                for (const f of files) dt.items.add(f);
                addImages(dt.files);
              }}
              placeholder="Mensagem"
              rows={1}
              className="flex-1 text-[15px] resize-none border-0 focus-visible:ring-0 bg-transparent shadow-none px-0 py-1 min-h-0 leading-6 overflow-y-auto caret-foreground text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500"
              style={{ maxHeight: 216 }}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Anexar"
                  className="h-9 w-9 rounded-full grid place-items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-white/60 transition"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-60">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Arquivos de
                </DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" /> Imagem
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onSelect={() => { imageKindRef.current = "comment_image"; imageInputRef.current?.click(); }}
                    >
                      Só no chat
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => { imageKindRef.current = "gallery"; imageInputRef.current?.click(); }}
                    >
                      Também na galeria do caso
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                {(["scans", "exocad_html", "model", "fabrication"] as AttachKind[]).map((k) => (
                  <DropdownMenuItem
                    key={k}
                    className="gap-2"
                    onSelect={() => {
                      fileKindRef.current = k;
                      // aguarda o accept ser aplicado antes de abrir o seletor
                      setTimeout(() => fileInputRef.current?.click(), 0);
                    }}
                  >
                    <AttachKindIcon kind={k} className="h-4 w-4 text-primary" />
                    {k === "scans" ? "Escaneamentos" : k === "exocad_html" ? "HTML" : k === "model" ? "Modelos" : "Elementos"}
                    <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0" />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => addImages(e.target.files, imageKindRef.current)} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={ATTACH_ACCEPT[fileKindRef.current]}
              onChange={(e) => addFiles(e.target.files, fileKindRef.current)}
            />

          </div>
          )}

          <button
            type="button"
            onClick={async () => {
              const hasContent = !!text.trim() || pendingImages.length > 0 || pendingFiles.length > 0;
              if (recorder.state === "recording") {
                try {
                  const transcript = await recorder.stopAndTranscribe();
                  if (transcript) {
                    setText((t) => (t ? `${t} ${transcript}` : transcript));
                    taRef.current?.focus();
                  } else {
                    toast.info("Não identifiquei fala no áudio.");
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha na transcrição.");
                }
                return;
              }
              if (recorder.state === "transcribing") return;
              if (hasContent) { submitMessage(); return; }
              const ok = await recorder.start();
              if (!ok) toast.error("Não foi possível acessar o microfone.");
            }}
            aria-label={
              recorder.state === "recording"
                ? "Parar e transcrever"
                : text.trim() || pendingImages.length || pendingFiles.length
                  ? "Enviar"
                  : "Gravar áudio"
            }
            className={cn(
              "h-14 w-14 shrink-0 rounded-full text-white grid place-items-center shadow-md transition disabled:opacity-60",
              recorder.state === "recording"
                ? "bg-rose-500 hover:bg-rose-600 animate-pulse"
                : "bg-[#1F8AFF] hover:bg-[#1877E8]",
            )}
          >
            {recorder.state === "transcribing" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : recorder.state === "recording" ? (
              <Square className="h-5 w-5" />
            ) : text.trim() || pendingImages.length || pendingFiles.length ? (
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

function UnreadDivider() {
  return (
    <div data-unread-divider="true" className="flex items-center gap-2 my-4 scroll-mt-4">
      <div className="flex-1 h-px bg-primary/40" />
      <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30">
        Não lidas
      </span>
      <div className="flex-1 h-px bg-primary/40" />
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

function ChatBubble({ isMine, tail, time, children }: { isMine: boolean; tail?: boolean; time?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [singleLine, setSingleLine] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight || "0");
      setSingleLine(!!lh && el.scrollHeight <= lh * 1.6);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

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
      style={style}
      className={cn(
        "px-5 py-3 text-[16px] leading-[1.45] shadow-sm break-words max-w-full",
        isMine
          ? "bg-[#1F8AFF] text-white"
          : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100",
      )}
    >
      <div className="flex flex-col">
        <div ref={ref} className="whitespace-pre-wrap">{children}</div>
        {time && (
          <span
            className={cn(
              "self-end mt-1 text-[11px] leading-none whitespace-nowrap select-none",
              isMine ? "text-white/70" : "text-slate-400 dark:text-slate-500",
            )}
          >
            {time}
          </span>
        )}
      </div>
    </div>
  );
}

/** Barra de gravação de áudio (estilo mensageiro): lixeira, tempo, waveform. */
function RecordingBar({
  seconds,
  transcribing,
  onCancel,
}: {
  seconds: number;
  transcribing: boolean;
  onCancel: () => void;
}) {
  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const bars = useMemo(
    () => Array.from({ length: 28 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75),
    [],
  );

  return (
    <div className="flex-1 h-14 rounded-full bg-[#f1f1f3] dark:bg-slate-800 flex items-center pl-3 pr-5 gap-3">
      <button
        type="button"
        aria-label="Cancelar gravação"
        onClick={onCancel}
        disabled={transcribing}
        className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-slate-400 hover:text-rose-500 hover:bg-white/60 dark:hover:bg-slate-700/60 transition disabled:opacity-40"
      >
        <Trash2 className="h-5 w-5" />
      </button>

      <div className="flex-1 flex items-center justify-end gap-4 min-w-0">
        {transcribing ? (
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-300 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo áudio…
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2 shrink-0">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[14px] font-medium tabular-nums text-slate-600 dark:text-slate-200">
                {mm}:{ss}
              </span>
            </span>
            <div className="flex items-end gap-[2px] h-7 overflow-hidden">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-slate-400/80 dark:bg-slate-400/70 animate-pulse"
                  style={{
                    height: `${Math.round(h * 100)}%`,
                    animationDuration: `${700 + (i % 5) * 120}ms`,
                    animationDelay: `${(i % 7) * 60}ms`,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
