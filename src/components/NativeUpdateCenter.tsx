import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  DownloadCloud,
  FileCheck2,
  History,
  LoaderCircle,
  MonitorUp,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendDesktopNativeNotification } from "@/lib/desktop-local";
import {
  clearNativeReleaseCache,
  fetchNativeReleases,
  isNewerVersion,
  type NativeRelease,
} from "@/lib/native-updates";
import {
  openNativeInstaller,
  resolveNativeUpdateRuntime,
  type NativeUpdateRuntime,
} from "@/lib/native-update-runtime";
import { cn } from "@/lib/utils";

type NativeUpdateCenterContextValue = {
  runtime: NativeUpdateRuntime | null | undefined;
  hasUpdate: boolean;
  openCenter: () => void;
};

const NativeUpdateCenterContext = createContext<NativeUpdateCenterContextValue | null>(null);
const NOTIFICATION_KEY_PREFIX = "dentalflow:native-update:last-notified:v1";
const CATALOG_STALE_TIME_MS = 15 * 60 * 1000;
const BACKGROUND_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function notificationKey(runtime: NativeUpdateRuntime) {
  return `${NOTIFICATION_KEY_PREFIX}:${runtime.platform}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Tamanho não informado";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: index > 1 ? 1 : 0 })} ${units[index]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCheckedAt(value: number | undefined) {
  if (!value) return "Ainda não verificado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readableNotes(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();
}

function releaseState(release: NativeRelease, installedVersion: string, latestVersion: string) {
  if (release.version === installedVersion) return "Instalada";
  if (release.version === latestVersion && isNewerVersion(release.version, installedVersion))
    return "Nova";
  if (isNewerVersion(release.version, installedVersion)) return "Disponível";
  return "Anterior";
}

export function NativeUpdateCenterProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<NativeUpdateRuntime | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void resolveNativeUpdateRuntime()
      .then((value) => {
        if (active) setRuntime(value);
      })
      .catch((error) => {
        console.warn("[DentalFlow Updates] Runtime nativo indisponível", error);
        if (active) setRuntime(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const platform = runtime?.platform;
  const catalog = useQuery({
    queryKey: ["native-update-catalog", platform],
    queryFn: () => fetchNativeReleases(platform!),
    enabled: Boolean(platform),
    staleTime: CATALOG_STALE_TIME_MS,
    refetchInterval: platform ? BACKGROUND_CHECK_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const releases = catalog.data?.releases ?? [];
  const latest = releases[0] ?? null;
  const hasUpdate = Boolean(runtime && latest && isNewerVersion(latest.version, runtime.version));

  useEffect(() => {
    if (!runtime || !latest || !hasUpdate || typeof window === "undefined") return;
    const key = notificationKey(runtime);
    try {
      if (window.localStorage.getItem(key) === latest.version) return;
      window.localStorage.setItem(key, latest.version);
    } catch {
      // Notification is still useful when WebView storage is unavailable.
    }

    const title = `DentalFlow ${latest.version} disponível`;
    const body = `Há uma atualização para ${runtime.label}. Abra o centro de atualizações para baixar.`;
    toast(title, {
      id: `native-update-${runtime.platform}-${latest.version}`,
      description: body,
      duration: 10_000,
      action: { label: "Ver agora", onClick: () => setOpen(true) },
    });

    if (runtime.platform === "android") {
      window.dispatchEvent(
        new CustomEvent("dentalflow:native-update-notification", {
          detail: {
            id: `native-update-${latest.version}`,
            title,
            body,
            type: "system_update",
          },
        }),
      );
    } else {
      void sendDesktopNativeNotification({ title, body });
    }
  }, [hasUpdate, latest, runtime]);

  const context = useMemo<NativeUpdateCenterContextValue>(
    () => ({
      runtime,
      hasUpdate,
      openCenter: () => setOpen(true),
    }),
    [hasUpdate, runtime],
  );

  const refresh = async () => {
    if (!runtime) return;
    clearNativeReleaseCache(runtime.platform);
    const result = await catalog.refetch();
    if (result.error) {
      toast.error("Não foi possível verificar agora", {
        description:
          "O histórico salvo continuará disponível. Tente novamente quando houver conexão.",
      });
    } else {
      toast.success("Atualizações verificadas");
    }
  };

  const download = async (release: NativeRelease) => {
    if (!runtime || downloadingId !== null) return;
    setDownloadingId(release.installer.id || release.id);
    try {
      await openNativeInstaller(runtime, release.installer.downloadUrl);
      toast.success("Download aberto no navegador", {
        description:
          runtime.platform === "android"
            ? "Quando terminar, abra o APK baixado para instalar a atualização."
            : "Quando terminar, execute o instalador do DentalFlow.",
      });
    } catch (error) {
      console.warn("[DentalFlow Updates] Falha ao abrir instalador", error);
      toast.error("Não foi possível abrir o instalador", {
        description: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const PlatformIcon = runtime?.platform === "android" ? Smartphone : MonitorUp;
  const latestVersion = latest?.version ?? "";

  return (
    <NativeUpdateCenterContext.Provider value={context}>
      {children}

      {runtime ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-6 py-5 pr-14">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <DownloadCloud className="h-5 w-5 stroke-[1.5]" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-left text-xl font-medium">
                    Centro de atualizações
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-1.5 text-left text-xs">
                    <PlatformIcon className="h-3.5 w-3.5" />
                    DentalFlow para {runtime.label} · versão instalada {runtime.version}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="h-[min(64vh,620px)] min-h-[330px]">
              <div className="space-y-5 p-6">
                <section
                  className={cn(
                    "rounded-2xl border p-5",
                    hasUpdate ? "border-primary/20 bg-primary/5" : "border-border bg-muted/25",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                        hasUpdate ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
                      )}
                    >
                      {catalog.isLoading ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : hasUpdate ? (
                        <Download className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-foreground">
                          {catalog.isLoading
                            ? "Verificando atualizações…"
                            : hasUpdate
                              ? `Nova versão ${latest?.version} disponível`
                              : latest
                                ? "Seu DentalFlow está atualizado"
                                : "Nenhum instalador publicado para esta plataforma"}
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void refresh()}
                          disabled={catalog.isFetching}
                          className="text-muted-foreground"
                        >
                          <RefreshCw
                            className={cn("h-3.5 w-3.5", catalog.isFetching && "animate-spin")}
                          />
                          Verificar
                        </Button>
                      </div>
                      <p className="mt-1 text-xs font-light leading-relaxed text-muted-foreground">
                        {hasUpdate
                          ? "O instalador abaixo corresponde somente ao sistema deste dispositivo."
                          : "A verificação é automática e separada por plataforma."}
                      </p>
                    </div>
                  </div>
                </section>

                {catalog.isError && !catalog.data ? (
                  <section className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <div>
                      <h3 className="text-sm font-medium">Catálogo indisponível</h3>
                      <p className="mt-1 text-xs font-light leading-relaxed text-muted-foreground">
                        Não foi possível consultar as versões. O DentalFlow tentará novamente em
                        segundo plano.
                      </p>
                    </div>
                  </section>
                ) : null}

                {releases.length > 0 ? (
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Instaladores para {runtime.label}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {releases.map((release) => {
                        const state = releaseState(release, runtime.version, latestVersion);
                        const busy = downloadingId === (release.installer.id || release.id);
                        const digest = release.installer.digest?.replace(/^sha256:/i, "");
                        return (
                          <article
                            key={`${release.platform}-${release.id}-${release.version}`}
                            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-medium tracking-tight">
                                    Versão {release.version}
                                  </h4>
                                  <span
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                      state === "Nova"
                                        ? "bg-primary/10 text-primary"
                                        : state === "Instalada"
                                          ? "bg-success/10 text-success"
                                          : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {state}
                                  </span>
                                  {release.mandatory ? (
                                    <span className="rounded-full bg-warning/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-warning-foreground">
                                      Importante
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                  <span>{formatDate(release.publishedAt)}</span>
                                  <span>{formatFileSize(release.installer.size)}</span>
                                  <span className="truncate">{release.installer.name}</span>
                                </div>
                                {release.notes ? (
                                  <p className="mt-3 whitespace-pre-line text-xs font-light leading-relaxed text-muted-foreground">
                                    {readableNotes(release.notes)}
                                  </p>
                                ) : null}
                                {digest || release.checksum ? (
                                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <FileCheck2 className="h-3.5 w-3.5 text-success" />
                                    SHA-256 publicado{digest ? ` · ${digest.slice(0, 16)}…` : ""}
                                  </div>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant={state === "Nova" ? "default" : "outline"}
                                onClick={() => void download(release)}
                                disabled={downloadingId !== null}
                                className="w-full shrink-0 sm:w-auto"
                              >
                                {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
                                {state === "Instalada" ? "Baixar novamente" : "Baixar instalador"}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <section className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <h3 className="text-xs font-medium">
                      Downloads oficiais e separados por plataforma
                    </h3>
                    <p className="mt-1 text-[11px] font-light leading-relaxed text-muted-foreground">
                      Este dispositivo recebe apenas{" "}
                      {runtime.platform === "android"
                        ? "arquivos APK do Android"
                        : "instaladores EXE do Windows"}
                      . Endereços fora do repositório oficial são bloqueados.
                    </p>
                  </div>
                </section>
              </div>
            </ScrollArea>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-6 py-3 text-[10px] text-muted-foreground">
              <span>Última verificação: {formatCheckedAt(catalog.data?.checkedAt)}</span>
              <span>
                {catalog.data?.source === "cache" ? "Histórico local" : "Catálogo oficial"}
              </span>
            </footer>
          </DialogContent>
        </Dialog>
      ) : null}
    </NativeUpdateCenterContext.Provider>
  );
}

export function NativeUpdateCenterButton({ className }: { className?: string }) {
  const center = useContext(NativeUpdateCenterContext);
  if (!center?.runtime) return null;

  return (
    <button
      type="button"
      data-no-window-drag
      onClick={center.openCenter}
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-primary active:scale-95",
        className,
      )}
      title={center.hasUpdate ? "Atualização disponível" : "Centro de atualizações"}
      aria-label={
        center.hasUpdate ? "Abrir atualização disponível" : "Abrir centro de atualizações"
      }
    >
      <DownloadCloud className="h-[21px] w-[21px] stroke-[1.4px]" />
      {center.hasUpdate ? (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
      ) : null}
    </button>
  );
}
