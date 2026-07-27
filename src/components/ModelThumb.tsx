import { useEffect, useState } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { getModelThumb, peekModelThumb } from "@/lib/model-thumb";

interface Props {
  storagePath: string;
  fileName: string;
  className?: string;
}

/** Lazy STL/PLY thumbnail. Falls back to an icon on error. */
export function ModelThumb({ storagePath, fileName, className }: Props) {
  // Use the in-memory cache synchronously as the initial state, so when the
  // thumb was prewarmed (or already shown once this session) it appears with
  // ZERO flash — no spinner frame, no async wait.
  const [url, setUrl] = useState<string | null>(() => peekModelThumb(storagePath) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const hot = peekModelThumb(storagePath);
    if (hot) { setUrl(hot); setError(false); return; }
    let cancelled = false;
    setUrl(null); setError(false);
    getModelThumb(storagePath, fileName).then(
      (u) => { if (!cancelled) setUrl(u); },
      () => { if (!cancelled) setError(true); },
    );
    return () => { cancelled = true; };
  }, [storagePath, fileName]);

  if (error) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Boxes className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (!url) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="w-full h-full thumb-surface">
        <img src={url} alt={fileName} className="w-full h-full object-cover" loading="lazy" />
      </div>
    </div>
  );
}
