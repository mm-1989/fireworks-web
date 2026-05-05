import { getMode, onModeChange, setMode, type Mode } from "./mode";

/**
 * 画面右上に固定表示するモード切替トグル。
 * 「花火」「描画」の 2 ボタンを並べ、active 側をハイライトする。
 */
export function mountModeToggle(): void {
  const wrap = document.createElement("div");
  wrap.className = "mode-toggle";

  const fwBtn = makeBtn("花火", "firework");
  const drawBtn = makeBtn("描画", "drawing");
  wrap.appendChild(fwBtn);
  wrap.appendChild(drawBtn);
  document.body.appendChild(wrap);

  function refresh(m: Mode): void {
    fwBtn.classList.toggle("mode-toggle__btn--active", m === "firework");
    drawBtn.classList.toggle("mode-toggle__btn--active", m === "drawing");
  }
  refresh(getMode());
  onModeChange(refresh);
}

function makeBtn(label: string, target: Mode): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mode-toggle__btn";
  b.textContent = label;
  b.addEventListener("click", () => setMode(target));
  return b;
}
