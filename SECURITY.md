# Security Policy

## 報告方法

脆弱性を発見した場合は、**GitHub Security Advisories** 経由で非公開にご報告ください。

1. リポジトリの **Security** タブを開く
2. **"Report a vulnerability"** をクリック
3. 詳細を記入して送信

公開の Issue / PR / Discussions には脆弱性情報を投稿しないでください。

## 対象範囲

本プロジェクトは個人運用の学習兼デモプロジェクトです。SLA は提供しません。
対応可能な範囲で確認・修正を行います。

## スコープ外

- 第三者サービス(GitHub Pages, npm レジストリ等)自体の脆弱性
- 既知の Three.js / Vite 上流の問題(直接 Upstream に報告してください)
- ブラウザ固有の挙動・未修正の OS 脆弱性

## 依存関係

- Dependabot により週次で依存更新 PR が作成されます
- `npm audit --audit-level=high` が pre-push hook で実行されます
