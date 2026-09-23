# MimiFlow

リスニング、シャドーイング、読解、問題演習、単語帳、FSRS 間隔反復をまとめた語学学習アプリです。

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[English](README.md) · [简体中文](README.zh-CN.md)

## ローカル開発

Node.js 22–26、Rust 1.88+、PostgreSQL が必要です。`.env.local` に `DATABASE_URL` を設定して実行します。

```sh
npm ci
npm run db:push
npm run dev
```

[localhost:3000](http://localhost:3000) を開きます。コンテンツ管理は `/manage` です。
メールアドレスとパスワードでログインします。登録モードは `REGISTRATION_MODE=disabled|invite|open` で設定できます。現在のローカル設定は招待制です。メール設定と運用方法は[登録ガイド](docs/registration.md)を参照してください。新規アカウントは管理者ではなく、`/manage` に入れません。既存ユーザーは ID を確認してから `MIMIFLOW_CLAIM_PASSWORD` と `npm run user:claim -- <ユーザーID> <メール>` で紐付けできます。
単語帳とその収録語は全アカウントで共有し、管理者が編集します。単語帳にない個人の単語、語彙復習カード、解答履歴はアカウントごとに分離します。
`npm ci` は Prisma Client を生成します。スキーマ変更後は `npm run db:generate` と `npm run db:push` を実行します。
日本語解析は Rust Node-API 拡張で実行します。`npm ci` がビルドと辞書の準備を行います。[詳細](modules/language/native/README.md)。
macOS では開発起動時に Homebrew PostgreSQL を起動できます。複数バージョンがある場合は `POSTGRES_SERVICE` を指定します。

## 構成

- `app/`：ページ、レイアウト、API ルート
- `modules/`：ドメイン、サービス、hooks、機能別 UI
- `components/`、`context/`、`hooks/`：共通 UI とアプリの状態
- `lib/`、`utils/`：基盤、コーデック、既存リポジトリ、共通関数
- `prisma/`：データモデル、`scripts/`：テストと保守ツール

新しいドメイン・永続化処理は `modules/` に配置します。開発規約は [AGENTS.md](AGENTS.md)、UI 規約は [DESIGN.md](DESIGN.md) を参照してください。

## 検証

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` はローカル PostgreSQL に一時的なテスト用データベースを作成し、アプリをビルドして Chrome で二つのアカウントの復習フローを検証します。スクリーンショットと結果は `outputs/e2e/` に保存されます。詳細は[テスト手順](docs/testing.md)を参照してください。
