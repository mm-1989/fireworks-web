# fireworks-web

子供向け花火タップWebアプリ。タップ/クリックで花火が打ち上がる。
Three.jsの学習兼、iPhone Safari向けPWA化を目指す。

## 技術スタック

- **ビルド**: Vite 8 + TypeScript
- **3D**: Three.js (0.184)
- **配信**: GitHub Pages (private repo → public site)
- **対象**: iPhone Safari 優先、PC/Androidブラウザも動作

## ディレクトリ構成

```
fireworks-web/
├── .github/
│   └── dependabot.yml     週次で依存更新PR
├── .husky/
│   ├── pre-commit         gitleaksで秘密情報スキャン
│   └── pre-push           gitleaks全履歴 + npm audit + build
├── src/
│   ├── main.ts            Three.jsシーン + タップ→花火
│   └── style.css          全画面・タッチ操作最適化
├── public/                faviconなど静的ファイル
├── index.html             PWAメタタグ設定済み
├── .gitignore             .env/秘密鍵パターン強化済み
├── .gitattributes         改行LF統一
└── .env.example           環境変数サンプル
```

## よく使うコマンド

```bash
npm run dev           # 開発サーバ起動 (http://localhost:5173)
npm run dev -- --host # LAN公開 (iPhone実機確認用)
npm run build         # 本番ビルド → dist/
npm run preview       # ビルド成果物プレビュー
npm run typecheck     # 型チェックのみ
npm run audit:secrets # gitleaksで全履歴スキャン
```

## iPhone実機での確認手順

1. `npm run dev -- --host` でLAN公開
2. 表示される `http://192.168.x.x:5173` をiPhoneのSafariで開く
3. PC(WSL)とiPhoneが同一Wi-Fiにいることを確認
4. ファイアウォール許可が必要な場合あり

## フェーズ別の開発計画

### Phase 1 (完了)
- Vite + TS + Three.js 初期化
- タップで1種類の花火が上がる最小動作版
- セキュリティガードレール(gitleaks, Dependabot, husky hooks)

### Phase 2 (次)
- [ ] 花火の形バリエーション (輪・しだれ・星型)
- [ ] Web Audio APIで打ち上げ音・炸裂音
- [ ] ランダムな自動打ち上げモード
- [ ] パーティクル数調整 (デバイス性能に応じて)

### Phase 3
- [ ] PWA化 (vite-plugin-pwa)
- [ ] GitHub Pages用ワークフロー (`.github/workflows/deploy.yml`)
- [ ] private repo作成 → 初回push
- [ ] iPhone「ホーム画面に追加」手順ドキュメント化

## Three.js学習メモ

- **Scene/Camera/Renderer**: Three.jsの基本3点セット
- **BufferGeometry**: パーティクル多数描画時の標準。属性(position/color等)を`Float32Array`で直接操作
- **Points + PointsMaterial**: 点描画。画像テクスチャを`map`に指定すれば火の粉感が出る
- **AdditiveBlending**: 重なった光が明るくなる。花火/光源表現の定番
- **unproject**: NDC座標→ワールド座標変換。タップ位置をシーンに反映する鍵

## セキュリティ運用

- コミット前: `.husky/pre-commit` が自動で `gitleaks protect --staged` 実行
- push前: `.husky/pre-push` が `gitleaks detect`(全履歴) + `npm audit` + `build` 実行
- 秘密情報を誤ってコミットしようとするとpre-commitで失敗 → 修正してから再コミット
- `.env`系ファイルは`.gitignore`で除外済み。`.env.example`のみコミット可
- GitHub側の "Secret scanning + Push protection" も有効化推奨(Settings > Code security)

## 既知の注意点

- **iOS Safari音声制限**: `AudioContext` は最初のユーザ操作で `resume()` 必須 (Phase 2実装時)
- **dev serverのLAN公開**: `--host` 指定時は同一LAN内からアクセス可能になる点に留意
- **gitleaks未インストール時**: 他環境でcloneした場合、`~/.local/bin/gitleaks` を別途導入要
