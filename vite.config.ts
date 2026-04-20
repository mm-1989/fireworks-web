import { defineConfig } from "vite";

// GitHub Pages のサブパス配信 (https://<user>.github.io/fireworks-web/) に合わせ base を固定。
// リポジトリ名を変更した場合はここも合わせて更新する。
export default defineConfig({
  base: "/fireworks-web/",
  build: {
    // 元 TS コードの復元を防ぐため source map は明示的にオフ
    sourcemap: false,
  },
});
