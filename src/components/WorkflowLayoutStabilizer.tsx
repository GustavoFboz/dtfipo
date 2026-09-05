import { useEffect } from "react";

function markWorkflowBars() {
  document.querySelectorAll<HTMLElement>('[aria-current="step"]').forEach((current) => {
    const outer = current.closest<HTMLElement>("div.w-full.min-w-0");
    if (!outer) return;
    outer.dataset.caseWorkflowBar = "true";
    const row = outer.firstElementChild as HTMLElement | null;
    if (row) row.dataset.caseWorkflowRow = "true";
    const scroll = outer.querySelector<HTMLElement>(".overflow-x-auto");
    if (!scroll) return;
    scroll.dataset.caseWorkflowScroll = "true";
    const track = scroll.firstElementChild as HTMLElement | null;
    if (track) {
      track.dataset.caseWorkflowTrack = "true";
      Array.from(track.children).forEach((child) => {
        const el = child as HTMLElement;
        el.dataset.caseWorkflowStage = "true";
        el.dataset.current = el.contains(current) ? "true" : "false";
      });
    }
  });
}

export function WorkflowLayoutStabilizer() {
  useEffect(() => {
    markWorkflowBars();
    const observer = new MutationObserver(markWorkflowBars);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
