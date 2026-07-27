import { useCallback, useRef, useState } from "react";

/**
 * Multi-selection helper with anchor-based Shift range and Ctrl/Cmd toggle.
 *
 * Pass the currently ordered list of ids on each click so Shift-range picks
 * the right slice between the anchor and the clicked item.
 */
export function useMultiSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const setMany = useCallback((ids: string[], additive: boolean) => {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      ids.forEach((id) => next.add(id));
      return next;
    });
    if (ids.length > 0) anchorRef.current = ids[ids.length - 1];
  }, []);

  const handleClick = useCallback((id: string, e: React.MouseEvent | MouseEvent, orderedIds: string[]) => {
    const shift = e.shiftKey;
    const meta = e.metaKey || e.ctrlKey;
    setSelected((prev) => {
      if (shift && anchorRef.current && orderedIds.includes(anchorRef.current)) {
        const a = orderedIds.indexOf(anchorRef.current);
        const b = orderedIds.indexOf(id);
        if (a === -1 || b === -1) return prev;
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const next = meta ? new Set(prev) : new Set<string>();
        for (let i = lo; i <= hi; i += 1) next.add(orderedIds[i]);
        return next;
      }
      if (meta) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        anchorRef.current = id;
        return next;
      }
      // Plain click: toggle when already the only selected, else single-select.
      anchorRef.current = id;
      if (prev.size === 1 && prev.has(id)) return new Set<string>();
      return new Set<string>([id]);
    });
  }, []);

  return { selected, setSelected, handleClick, clear, anchorRef, setMany };
}
