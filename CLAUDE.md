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

### ローカル側
- コミット前: `.husky/pre-commit` が自動で `gitleaks protect --staged` 実行
- push前: `.husky/pre-push` が `gitleaks detect`(全履歴) + `npm audit` + `build` 実行
- 秘密情報を誤ってコミットしようとするとpre-commitで失敗 → 修正してから再コミット
- `.env`系ファイルは`.gitignore`で除外済み。`.env.example`のみコミット可

### Public リポジトリ運用(2026-04-20〜)
GitHub Pages Free プランの制約により Private 不可 → Public で運用。
**前提:** コミット履歴は永久公開される。後から Private に戻しても fork / キャッシュが残り得る。

**準拠すべきルール:**
1. コミット著者は必ず `*@users.noreply.github.com` 形式(`git config user.email` 確認)
2. 機密・個人情報・内部IP・実パス・実メールを絶対にコミット・コメント・メッセージに含めない
3. `.env` / credentials 系は **commitしない**(pre-commit hook が止める)
4. 新規依存追加時は必ず `npm audit` 通過を確認。high以上が残るなら原則マージ禁止
5. main への force push / branch 削除は禁止(GitHub側で branch protection 設定済み前提)
6. Issues / PR / Discussions は不要なら閉じる。開けるならレビュー前にコード実行しない

**GitHub側で有効化すべき設定:**
- Settings > Code security: **Secret scanning** + **Push protection** を ON
- Settings > Branches: main に **branch protection rule**(force push 禁止 / 削除禁止)
- Dependabot alerts / security updates: ON (デフォルト)

**公開前チェックリスト(新規ファイル/履歴を加えるたび):**
- [ ] `gitleaks detect` 全履歴パス
- [ ] `git log --format='%ae' | sort -u` が noreply 形式のみ
- [ ] grep で実IP/実メール/個人情報がないこと
- [ ] `.env` や credential 系が tracked files にないこと(`git ls-files | grep -i env`)

### 脆弱性報告
外部からの報告フローは `SECURITY.md` 参照。GitHub Security Advisories 経由で非公開受付。

### ライセンス
`LICENSE` は "All rights reserved" 方針。ソース公開はしているが再利用・再配布は許可していない。

## 既知の注意点

- **iOS Safari音声制限**: `AudioContext` は最初のユーザ操作で `resume()` 必須 (Phase 2実装時)
- **dev serverのLAN公開**: `--host` 指定時は同一LAN内からアクセス可能になる点に留意
- **gitleaks未インストール時**: 他環境でcloneした場合、`~/.local/bin/gitleaks` を別途導入要
