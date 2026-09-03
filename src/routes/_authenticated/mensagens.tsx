import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCases } from "@/lib/api";
import { fetchCaseActivity, type CaseActivity } from "@/lib/case-activity";
import { CaseComments } from "@/components/CaseComments";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mensagens")({
  component: MessagesInboxPage,
});

type Thread = {
  caseId: string;
  caseNumber: number | null;
  patientName: string;
  last: CaseActivity;
  unread: number;
};

function MessagesInboxPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();

  const casesQ = useQuery({
    queryKey: ["cases", "messages-inbox"],
    queryFn: () => fetchCases("all"),
    staleTime: 15_000,
  });

  const activityQ = useQuery({
    queryKey: ["messages_inbox_activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_activity" as never)
        .select("*")
        .eq("kind", "comment")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as CaseActivity[];
    },
    refetchInterval: 5000,
    staleTime: 0,
  });

  const currentUserQ = useQuery({
    queryKey: ["messages_inbox_me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: Infinity,
  });

  // Keep the inbox live without relying only on polling. RLS on case_activity
  // remains the authorization boundary, so users only receive comments they
  // are allowed to read.
  useEffect(() => {
    const userId = currentUserQ.data;
    if (!userId) return;

    const channel = supabase
      .channel(`messages-inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_activity" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["messages_inbox_activity"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_activity_reads" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["messages_inbox_reads"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserQ.data, queryClient]);

  const commentIds = useMemo(
    () => (activityQ.data ?? []).map((a) => a.id).filter((id) => !id.startsWith("optimistic-")),
    [activityQ.data],
  );

  const readsQ = useQuery({
    queryKey: ["messages_inbox_reads", commentIds.join(",")],
    enabled: commentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_activity_reads" as never)
        .select("activity_id,user_id")
        .in("activity_id", commentIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ activity_id: string; user_id: string }>;
    },
    refetchInterval: 5000,
  });

  const threads = useMemo<Thread[]>(() => {
    const caseMap = new Map((casesQ.data ?? []).map((c) => [c.id, c]));
    const readByMe = new Set(
      (readsQ.data ?? [])
        .filter((r) => r.user_id === currentUserQ.data)
        .map((r) => r.activity_id),
    );

    const grouped = new Map<string, CaseActivity[]>();
    for (const activity of activityQ.data ?? []) {
      if (!caseMap.has(activity.case_id)) continue;
      const list = grouped.get(activity.case_id) ?? [];
      list.push(activity);
      grouped.set(activity.case_id, list);
    }

    return Array.from(grouped.entries())
      .map(([caseId, messages]) => {
        const caseRow = caseMap.get(caseId)!;
        const sorted = [...messages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const unread = sorted.filter(
          (message) =>
            message.user_id !== currentUserQ.data &&
            !readByMe.has(message.id),
        ).length;

        return {
          caseId,
          caseNumber: caseRow.case_number ?? null,
          patientName: caseRow.patient?.name ?? "Caso",
          last: sorted[0],
          unread,
        };
      })
      .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [casesQ.data, activityQ.data, readsQ.data, currentUserQ.data]);

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return threads;
    return threads.filter((thread) =>
      thread.patientName.toLocaleLowerCase("pt-BR").includes(q) ||
      String(thread.caseNumber ?? "").includes(q) ||
      String(thread.last.content ?? "").toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [threads, query]);

  const selected = selectedCaseId
    ? threads.find((thread) => thread.caseId === selectedCaseId) ?? null
    : null;
  const effectiveCaseId = selected?.caseId ?? null;

  return (
    <div className="h-full min-h-0 p-4 md:p-6">
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-card grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={cn(
          "min-h-0 border-r border-border flex flex-col",
          effectiveCaseId ? "max-md:hidden" : "",
        )}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold tracking-tight">Mensagens</h1>
                <p className="text-xs text-muted-foreground">Conversas organizadas por caso</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar paciente ou caso"
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visibleThreads.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conversa disponível.
              </div>
            ) : visibleThreads.map((thread) => {
              const active = thread.caseId === effectiveCaseId;
              return (
                <button
                  key={thread.caseId}
                  type="button"
                  onClick={() => setSelectedCaseId(thread.caseId)}
                  className={cn(
                    "w-full text-left px-4 py-3.5 border-b border-border/60 transition",
                    active ? "bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 font-semibold">
                      {thread.patientName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{thread.patientName}</div>
                        {thread.unread > 0 && (
                          <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                            {thread.unread > 99 ? "99+" : thread.unread}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {thread.caseNumber ? `Caso #${thread.caseNumber}` : "Caso"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-1">
                        {thread.last.content || "Nova mensagem"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 flex flex-col">
          {effectiveCaseId ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button
                  type="button"
                  className="md:hidden text-sm text-primary"
                  onClick={() => setSelectedCaseId(null)}
                >
                  Voltar
                </button>
                <div className="min-w-0">
                  <div className="font-medium truncate">{selected?.patientName}</div>
                  <div className="text-xs text-muted-foreground">
                    {selected?.caseNumber ? `Caso #${selected.caseNumber}` : "Conversa do caso"}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <CaseComments caseId={effectiveCaseId} focusActivityId={selected?.last.id ?? null} />
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-center p-8 text-muted-foreground">
              <div>
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecione uma conversa.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
