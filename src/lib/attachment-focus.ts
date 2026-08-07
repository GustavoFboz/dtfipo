import type { CaseAttachmentKind } from "@/lib/api";

export type AttachmentFocusRequest = {
  caseId: string;
  kind: string;
  attachmentId: string;
};

type Listener = (req: AttachmentFocusRequest) => void;

const listeners = new Set<Listener>();

/** Pede para a UI abrir a aba do anexo e pré-selecionar o item. */
export function requestAttachmentFocus(req: AttachmentFocusRequest) {
  for (const l of Array.from(listeners)) l(req);
}

export function onAttachmentFocus(cb: Listener) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
