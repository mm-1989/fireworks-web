/**
 * 操作モード。"firework" は従来のタップ→花火/スワイプ→流れ星、
 * "drawing" は指の軌跡を残留レイヤに直接描く。
 */
export type Mode = "firework" | "drawing";

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
