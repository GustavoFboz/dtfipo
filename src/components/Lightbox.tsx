import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { usePreservePageScroll } from "@/hooks/use-preserve-page-scroll";

export function Lightbox({
  open, images, index, onIndexChange, onClose,
}: {
  open: boolean;
  images: { url: string; name: string }[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  usePreservePageScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onIndexChange, onClose]);

  if (!open || images.length === 0) return null;
  const cur = images[index];
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10">
        <X className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Baixar imagem"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            const res = await fetch(cur.url);
            const blob = await res.blob();
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = cur.name || "imagem";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 1000);
          } catch {
            window.open(cur.url, "_blank");
          }
        }}
        className="absolute top-4 right-16 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10">
        <Download className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + images.length) % images.length); }}
            className="absolute left-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10">
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % images.length); }}
            className="absolute right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10">
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}
      <img src={cur.url} alt={cur.name} onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs px-3 py-1 rounded-full bg-white/10">
        {cur.name} · {index + 1}/{images.length}
      </div>
    </div>
  );
}
