import { CHARGE_MAX_STEPS } from "./config";

/**
 * 押下位置に表示するチャージ進捗インジケータ。
 * DOM 直書きで WebGL とは別レイヤ (z-index で scene の上) に配置する。
 *
 * SVG の円周を stroke-dasharray で切り、段階比率に応じて dashoffset を詰める。
 * 目盛は CHARGE_MAX_STEPS 分の短い線を外側に配置し、溜まり具合が視認できるようにする。
 */
export interface ChargeIndicator {
  show(clientX: number, clientY: number): void;
  setStep(step: number): void;
  hide(): void;
}

const SIZE = 88;
const RADIUS = 36;
const CIRC = 2 * Math.PI * RADIUS;

export function createChargeIndicator(): ChargeIndicator {
  const root = document.createElement("div");
  root.className = "charge-indicator";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);

  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const bg = document.createElementNS(NS, "circle");
  bg.setAttribute("cx", String(cx));
  bg.setAttribute("cy", String(cy));
  bg.setAttribute("r", String(RADIUS));
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "rgba(255,255,255,0.18)");
  bg.setAttribute("stroke-width", "4");
  svg.appendChild(bg);

  // 目盛 (10 本)
  const tickGroup = document.createElementNS(NS, "g");
  tickGroup.setAttribute("stroke", "rgba(255,255,255,0.35)");
  tickGroup.setAttribute("stroke-width", "2");
  for (let i = 0; i < CHARGE_MAX_STEPS; i++) {
    const angle = (i / CHARGE_MAX_STEPS) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * (RADIUS + 3);
    const y1 = cy + Math.sin(angle) * (RADIUS + 3);
    const x2 = cx + Math.cos(angle) * (RADIUS + 7);
    const y2 = cy + Math.sin(angle) * (RADIUS + 7);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    tickGroup.appendChild(line);
  }
  svg.appendChild(tickGroup);

  const progress = document.createElementNS(NS, "circle");
  progress.setAttribute("cx", String(cx));
  progress.setAttribute("cy", String(cy));
  progress.setAttribute("r", String(RADIUS));
  progress.setAttribute("fill", "none");
  progress.setAttribute("stroke", "rgba(255,220,120,0.95)");
  progress.setAttribute("stroke-width", "5");
  progress.setAttribute("stroke-linecap", "round");
  progress.setAttribute("stroke-dasharray", String(CIRC));
  progress.setAttribute("stroke-dashoffset", String(CIRC));
  progress.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
  svg.appendChild(progress);

  root.appendChild(svg);
  document.body.appendChild(root);

  return {
    show(clientX, clientY) {
      root.style.left = `${clientX - SIZE / 2}px`;
      root.style.top = `${clientY - SIZE / 2}px`;
      progress.setAttribute("stroke-dashoffset", String(CIRC));
      root.classList.add("charge-indicator--visible");
    },
    setStep(step) {
      const t = Math.min(1, Math.max(0, step / CHARGE_MAX_STEPS));
      progress.setAttribute("stroke-dashoffset", String(CIRC * (1 - t)));
    },
    hide() {
      root.classList.remove("charge-indicator--visible");
    },
  };
}
