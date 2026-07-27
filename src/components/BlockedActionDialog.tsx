import { useCallback, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";

type BlockedState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
};

/**
 * Reusable centered dialog to block an action (e.g. cannot advance workflow
 * because criteria not met). Backdrop blur, 20%-rounded corners, single
 * full-width blue confirm button.
 */
export function useBlockedActionDialog() {
  const [state, setState] = useState<BlockedState>({
    open: false,
    title: "",
    description: "",
  });

  const show = useCallback(
    (title: string, description: string, confirmLabel?: string) =>
      setState({ open: true, title, description, confirmLabel }),
    [],
  );

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const dialogElement = (
    <BlockedActionDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      onClose={close}
    />
  );

  return { show, close, dialogElement };
}

export function BlockedActionDialog({
  open,
  title,
  description,
  confirmLabel = "Entendi",
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-transparent" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[20px] border border-border bg-card/80 backdrop-blur-xl shadow-[var(--shadow-card)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 grid place-items-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors border-t border-border/50"
          >
            {confirmLabel}
          </button>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
