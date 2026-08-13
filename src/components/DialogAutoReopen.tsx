import { useEffect } from "react";
/**
 * DialogAutoReopen has been deprecated in favor of URL-based persistence.
 * Logic is now directly integrated into NewCaseDialog and CaseDetailDialog
 * to ensure a cleaner and more reliable state recovery across refreshes.
 */
export function DialogAutoReopen() {
  useEffect(() => {
    // Cleanup old session storage keys to prevent conflicts
    if (typeof window !== "undefined") {
      const keys = ["dialog:new-case:open", "dialog:edit-case:open"];
      keys.forEach(k => {
        try { sessionStorage.removeItem(k); } catch(e) {}
      });
    }
  }, []);
  
  return null;
}

export const NEW_CASE_OPEN_KEY = "dialog:new-case:open";
export const NEW_CASE_FORM_KEY = "dialog:new-case:form";
export const EDIT_CASE_OPEN_KEY = "dialog:edit-case:open";
export function editCaseFormKey(caseId: string) {
  return `dialog:edit-case:${caseId}:form`;
}