/**
 * 操作モード。
 *  - "firework": タップ→花火、ドラッグ→軌跡を residue に描画
 *  - "shooting": スワイプ→流れ星 (タップは無効、charge UI も出さない)
 */
export type Mode = "firework" | "shooting";

let current: Mode = "firework";
const listeners = new Set<(m: Mode) => void>();

export function getMode(): Mode {
  return current;
}

export function setMode(next: Mode): void {
  if (next === current) return;
  current = next;
  for (const fn of listeners) fn(next);
}

export function onModeChange(fn: (m: Mode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
