import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCaseById } from "@/lib/api";
import { NewCaseDialog } from "./NewCaseDialog";
import { EditCaseDialog } from "./EditCaseDialog";
import { toast } from "sonner";

export const NEW_CASE_OPEN_KEY = "dialog:new-case:open";
export const NEW_CASE_FORM_KEY = "dialog:new-case:form";
export const EDIT_CASE_OPEN_KEY = "dialog:edit-case:open";
export function editCaseFormKey(caseId: string) {
  return `dialog:edit-case:${caseId}:form`;
}

type ReopenState =
  | { type: "new" }
  | { type: "edit"; caseId: string }
  | null;

function readInitial(): ReopenState {
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(NEW_CASE_OPEN_KEY) === "1") return { type: "new" };
    const editRaw = sessionStorage.getItem(EDIT_CASE_OPEN_KEY);
    if (editRaw) {
      const p = JSON.parse(editRaw) as { caseId?: string };
      if (p?.caseId) return { type: "edit", caseId: p.caseId };
    }
  } catch {
    // ignora
  }
  return null;
}

/**
 * Reabre automaticamente NewCaseDialog / EditCaseDialog quando a página é
 * recarregada com um deles aberto. Os próprios dialogs cuidam de restaurar
 * seus formulários via useSessionSnapshot; aqui só decidimos qual montar.
 */
export function DialogAutoReopen() {
  const [state, setState] = useState<ReopenState>(() => readInitial());


  const editQ = useQuery({
    queryKey: ["case_by_id", state?.type === "edit" ? state.caseId : null],
    queryFn: () => fetchCaseById(state!.type === "edit" ? (state as { caseId: string }).caseId : ""),
    enabled: state?.type === "edit",
    staleTime: 30_000,
  });

  if (!state) return null;

  const close = (o: boolean) => {
    if (!o) setState(null);
  };

  if (state.type === "new") {
    return <NewCaseDialog open onOpenChange={close} />;
  }

  if (!editQ.data) return null;
  return <EditCaseDialog caseRow={editQ.data} open onOpenChange={close} />;
}
