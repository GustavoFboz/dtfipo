import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rectangular drag-to-select ("marquee") helper.
 *
 * Usage:
 *   const { containerRef, marqueeStyle, onMouseDown } = useMarqueeSelection({
 *     onSelect: (ids, additive) => ...,
 *     itemAttr: "data-att-id",
 *   });
 *   <div ref={containerRef} onMouseDown={onMouseDown} className="relative">
 *     ...items with data-att-id="..."
 *     {marqueeStyle && <div style={marqueeStyle} className="..." />}
 *   </div>
 */
export function useMarqueeSelection(opts: {
  onSelect: (ids: string[], additive: boolean) => void;
  itemAttr?: string;
  /** Minimum drag distance (px) before marquee activates. Keeps clicks intact. */
  threshold?: number;
}) {
  const { onSelect, itemAttr = "data-select-id", threshold = 5 } = opts;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Ignore drags that start on interactive elements (buttons, links, inputs, images).
    if (target.closest("button,a,input,textarea,select,[role='button'],img,video")) return;
    const el = containerRef.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    startRef.current = {
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
    };
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!startRef.current || !containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      const dx = x - startRef.current.x;
      const dy = y - startRef.current.y;
      if (!rect && Math.hypot(dx, dy) < threshold) return;
      const left = Math.min(startRef.current.x, x);
      const top = Math.min(startRef.current.y, y);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      setRect({ left, top, width, height });
    };
    const handleUp = () => {
      if (!startRef.current || !containerRef.current) { startRef.current = null; setRect(null); return; }
      if (rect) {
        const cont = containerRef.current.getBoundingClientRect();
        const selRect = {
          left: cont.left + rect.left,
          top: cont.top + rect.top,
          right: cont.left + rect.left + rect.width,
          bottom: cont.top + rect.top + rect.height,
        };
        const ids: string[] = [];
        containerRef.current.querySelectorAll<HTMLElement>(`[${itemAttr}]`).forEach((node) => {
          const r = node.getBoundingClientRect();
          const intersects = !(r.right < selRect.left || r.left > selRect.right || r.bottom < selRect.top || r.top > selRect.bottom);
          if (intersects) {
            const id = node.getAttribute(itemAttr);
            if (id) ids.push(id);
          }
        });
        onSelect(ids, startRef.current.additive);
      }
      startRef.current = null;
      setRect(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [rect, threshold, itemAttr, onSelect]);

  const marqueeStyle: React.CSSProperties | null = rect
    ? {
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        background: "rgba(31,138,255,0.12)",
        border: "1px solid rgba(31,138,255,0.75)",
        pointerEvents: "none",
        zIndex: 20,
        borderRadius: 2,
      }
    : null;

  return { containerRef, marqueeStyle, onMouseDown };
}
