import type { TierInfo } from "./performanceTier";

/**
 * 右上にパーティクル数スケールなどのティア情報を小さく表示する。
 * 本番ビルドでは何もしない (DEV モードでのみ DOM に挿入)。
 */
export function mountDebugBadge(perf: TierInfo): void {
  if (!import.meta.env.DEV) return;

  const memoryLabel = perf.memoryGB !== null ? `/${perf.memoryGB}GB` : "";
  const text = `${perf.tier} (${perf.cores}c${memoryLabel}) x${perf.scale}`;

  const badge = document.createElement("div");
  badge.textContent = text;
  Object.assign(badge.style, {
    position: "fixed",
    top: "6px",
    right: "8px",
    font: "10px monospace",
    color: "#ffffffaa",
    background: "#00000055",
    padding: "2px 6px",
    borderRadius: "4px",
    pointerEvents: "none",
    zIndex: "10",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(badge);
}
