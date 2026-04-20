/**
 * 本番ビルドでのみ Service Worker を登録する。
 * dev では Vite のホットリロードと衝突するため無効化する。
 * 登録は load イベント後に行い、初回ペイントをブロックしない。
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("[sw] registered:", reg.scope))
      .catch((err) => console.warn("[sw] register failed:", err));
  });
}
