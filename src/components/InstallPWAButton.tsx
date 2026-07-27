import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const DISMISS_KEY = "dentalflow:pwa-dismissed";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

export function InstallPWAButton() {
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS doesn't fire beforeinstallprompt — show our own hint
    if (isIOS()) setVisible(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  function handleInstall() {
    setShowIOS(true);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <>
      <div className="md:hidden fixed bottom-[76px] inset-x-3 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border border-slate-100 dark:border-slate-800 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] p-3 flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center">
            <Download className="h-5 w-5 text-primary stroke-[1.5px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-slate-900 dark:text-slate-100 leading-tight">
              Instalar DentalFlow
            </div>
            <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
              Acesso rápido pelo seu celular
            </div>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium"
          >
            Instalar
          </button>
          <button
            onClick={dismiss}
            className="shrink-0 px-2 py-2 text-slate-400 text-[11px]"
            aria-label="Dispensar"
          >
            ✕
          </button>
        </div>
      </div>

      <Dialog open={showIOS} onOpenChange={setShowIOS}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar DentalFlow</DialogTitle>
            <DialogDescription className="pt-2">
              No navegador, abra o menu de compartilhamento ou opções <Share className="inline h-4 w-4 mx-1" />
              e selecione <strong>Adicionar à Tela de Início</strong> ou
              <strong> Instalar app</strong> para usar o DentalFlow como aplicativo.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
