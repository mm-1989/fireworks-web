/**
 * Phase A 用の簡易クリア表示。
 * 画面中央に半透明のパネル + CLEAR! テキスト + リロードボタンを出す。
 * Phase D で額縁付きの本格的なクリア画面に差し替える想定。
 */
export function showClearOverlay(): void {
  if (document.getElementById("clear-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "clear-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    background: "rgba(0, 0, 0, 0.55)",
    color: "#fff",
    zIndex: "100",
    font: "600 48px system-ui, -apple-system, sans-serif",
    letterSpacing: "0.08em",
    pointerEvents: "auto",
  } satisfies Partial<CSSStyleDeclaration>);

  const text = document.createElement("div");
  text.textContent = "CLEAR!";
  overlay.appendChild(text);

  const button = document.createElement("button");
  button.textContent = "もう一度";
  Object.assign(button.style, {
    font: "500 18px system-ui, -apple-system, sans-serif",
    padding: "12px 28px",
    borderRadius: "999px",
    border: "1px solid #ffffff88",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
  button.addEventListener("click", () => {
    window.location.reload();
  });
  overlay.appendChild(button);

  document.body.appendChild(overlay);
}
