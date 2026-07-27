import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCaseById } from "@/lib/api";
import { CaseDetailDialog } from "./CaseDetailDialog";

const OPEN_CASE_KEY = "case_dialog:open";

type DeepLinkState = { caseId: string | null; focus: string | null; source: "hash" | "session" | null };

function parseHash(): DeepLinkState {
  if (typeof window === "undefined") return { caseId: null, focus: null, source: null };
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return { caseId: null, focus: null, source: null };
  const params = new URLSearchParams(h);
  return { caseId: params.get("case"), focus: params.get("focus"), source: "hash" };
}

function parseSession(): DeepLinkState {
  if (typeof window === "undefined") return { caseId: null, focus: null, source: null };
  try {
    const saved = JSON.parse(sessionStorage.getItem(OPEN_CASE_KEY) || "null") as { caseId?: string } | null;
    return saved?.caseId ? { caseId: saved.caseId, focus: null, source: "session" } : { caseId: null, focus: null, source: null };
  } catch {
    return { caseId: null, focus: null, source: null };
  }
}

function parseInitialState(): DeepLinkState {
  const hash = parseHash();
  return hash.caseId ? hash : parseSession();
}

export function CaseDeepLink() {
  const [state, setState] = useState(parseInitialState());

  useEffect(() => {
    const onHash = () => setState(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { data: caseRow } = useQuery({
    queryKey: ["case_by_id", state.caseId],
    queryFn: () => fetchCaseById(state.caseId!),
    enabled: !!state.caseId,
    staleTime: 30_000,
  });

  // Highlight focus area after dialog opens
  useEffect(() => {
    if (!caseRow || !state.focus || state.source !== "hash") return;
    const t = setTimeout(() => {
      const sel =
        state.focus === "comments"
          ? '[data-case-section="comments"]'
          : state.focus === "attachments"
          ? '[data-case-section="attachments"]'
          : null;
      if (!sel) return;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-lg", "transition-all");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2400);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [caseRow, state.focus]);

  function close(open: boolean) {
    if (!open) {
      setState({ caseId: null, focus: null, source: null });
      try {
        sessionStorage.removeItem(OPEN_CASE_KEY);
      } catch {
        // sessionStorage can be unavailable in private/restricted contexts.
      }
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }

  if (!state.caseId || !caseRow) return null;
  return <CaseDetailDialog caseRow={caseRow} open onOpenChange={close} syncUrlHash={state.source === "hash"} />;
}
