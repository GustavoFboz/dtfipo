// FDI tooth numbering helpers
// Quadrants: 1 = sup. dir., 2 = sup. esq., 3 = inf. esq., 4 = inf. dir.
// Each row reads from patient's right to left.

export const TEETH_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
export const TEETH_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
export const TEETH_LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
export const TEETH_LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

export const ALL_TEETH = [
  ...TEETH_UPPER_RIGHT,
  ...TEETH_UPPER_LEFT,
  ...TEETH_LOWER_LEFT,
  ...TEETH_LOWER_RIGHT,
];

export function sortTeeth(arr: number[]): number[] {
  const order = new Map(ALL_TEETH.map((t, i) => [t, i]));
  return [...arr].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}
