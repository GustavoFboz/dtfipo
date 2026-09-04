export const TOOTH_ARCH_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const;
export const TOOTH_ARCH_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const;

export type ToothSelectionModifiers = {
  ctrl: boolean;
  shift: boolean;
};

export type ToothModifierSelectionResult = {
  next: number[];
  anchor: number;
  affected: number[];
  added: number[];
  removed: number[];
  kind: "toggle-add" | "toggle-remove" | "range-add" | "range-remove";
};

export function getToothRange(from: number, to: number): number[] | null {
  const arch = from < 30 ? TOOTH_ARCH_UPPER : TOOTH_ARCH_LOWER;
  if (!arch.includes(from as never) || !arch.includes(to as never)) return null;

  const start = arch.indexOf(from as never);
  const end = arch.indexOf(to as never);
  const [lo, hi] = start < end ? [start, end] : [end, start];
  return Array.from(arch.slice(lo, hi + 1));
}

/**
 * Applies only Ctrl/Cmd and Shift semantics. Plain clicks intentionally return
 * null because callers use different plain-click behavior (single-selection in
 * the generic selector versus focus/add in the case editor).
 *
 * Ctrl/Cmd always toggles exactly one tooth and makes that tooth the new range
 * anchor. Shift keeps the current anchor and toggles the whole contiguous FDI
 * interval: a fully selected interval is removed; otherwise the missing teeth
 * are added. Unrelated selections are preserved in both cases.
 */
export function applyToothModifierSelection(
  value: readonly number[],
  tooth: number,
  anchor: number | null,
  mods: ToothSelectionModifiers,
): ToothModifierSelectionResult | null {
  const current = new Set(value);

  if (mods.ctrl && !mods.shift) {
    const removing = current.has(tooth);
    if (removing) current.delete(tooth);
    else current.add(tooth);

    return {
      next: Array.from(current),
      anchor: tooth,
      affected: [tooth],
      added: removing ? [] : [tooth],
      removed: removing ? [tooth] : [],
      kind: removing ? "toggle-remove" : "toggle-add",
    };
  }

  if (mods.shift && anchor !== null) {
    const range = getToothRange(anchor, tooth);
    if (!range) return null;

    const removing = range.every((item) => current.has(item));
    const added: number[] = [];
    const removed: number[] = [];

    for (const item of range) {
      if (removing) {
        if (current.delete(item)) removed.push(item);
      } else if (!current.has(item)) {
        current.add(item);
        added.push(item);
      }
    }

    return {
      next: Array.from(current),
      anchor,
      affected: range,
      added,
      removed,
      kind: removing ? "range-remove" : "range-add",
    };
  }

  return null;
}
