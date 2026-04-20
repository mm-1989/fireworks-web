/**
 * 花火アプリ Service Worker
 *
 * 戦略: Stale-While-Revalidate
 *   - キャッシュがあれば即座にそれを返す (高速・オフライン対応)
 *   - 並行して fetch で最新を取得し、キャッシュを更新する
 *   - 次回アクセス時には更新後のファイルが返る
 *
 * ライフサイクル:
 *   install  → 新SW登録時。skipWaiting()で即activateへ
 *   activate → 旧SWが停止した後に起動。旧キャッシュを削除 + clients.claim()で制御開始
 *   fetch    → すべてのリクエスト(同一オリジンのGETのみ処理)
 */
const CACHE_NAME = "fireworks-v1";

self.addEventListener("install", () => {
  // 既存SWのアンロードを待たず、即座に新SWをactive状態へ
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 旧バージョンのキャッシュを削除
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      );
      // 既に開いているタブの制御権も奪取
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET以外 / 別オリジン(例: CDN)はSWで扱わずブラウザ標準に任せる
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      // ステータスOKな場合のみキャッシュ更新 (opaqueレスポンスは避ける)
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached); // オフライン時はキャッシュに退避

  // キャッシュがあれば即返し、並行してネットワーク更新を走らせる
  return cached || networkFetch;
}
