import { useEffect, useState, useSyncExternalStore } from "react";
import { getPrivateFileScope, getServerPrivateFileScope, resolvePrivateFile, subscribePrivateFileScope } from "@/lib/private-file-access";

export function usePrivateFileUrl(reference: string | null | undefined) {
  const scope = useSyncExternalStore(subscribePrivateFileScope, getPrivateFileScope, getServerPrivateFileScope);
  const [result, setResult] = useState<{ reference: string; scope: typeof scope; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined;
    let revision = 0;
    const load = async () => {
      const currentRevision = ++revision;
      if (!reference || !scope.ready || !scope.ownerId) return;
      try {
        const resolution = await resolvePrivateFile(reference, scope);
        if (!active || currentRevision !== revision) { resolution.release?.(); return; }
        release?.(); release = resolution.release;
        setResult({ reference, scope, url: resolution.url });
        timer = setTimeout(load, Math.max(1000, resolution.renewAt - Date.now()));
      } catch {
        if (active && currentRevision === revision) { release?.(); release = undefined; setResult(null); timer = setTimeout(load, 30_000); }
      }
    };
    const reload = () => { clearTimeout(timer); void load(); };
    void load();
    window.addEventListener("online", reload); window.addEventListener("offline", reload);
    return () => { active = false; clearTimeout(timer); release?.(); window.removeEventListener("online", reload); window.removeEventListener("offline", reload); };
  }, [reference, scope]);
  return result && result.reference === reference && result.scope === scope ? result.url : undefined;
}
