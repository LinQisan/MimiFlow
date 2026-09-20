# MimiFlow

リスニング、シャドーイング、読解、問題演習、単語帳、FSRS 間隔反復をまとめた語学学習アプリです。

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[English](README.md) · [简体中文](README.zh-CN.md)

## ローカル開発

Node.js 22–26、Python 3、PostgreSQL が必要です。`.env.local` に `DATABASE_URL` を設定して実行します。

```sh
npm ci
npm run sudachi:setup
npm run db:push
npm run dev
```

[localhost:3000](http://localhost:3000) を開きます。コンテンツ管理は `/manage` です。
`npm ci` は Prisma Client を生成します。スキーマ変更後は `npm run db:generate` と `npm run db:push` を実行します。
日本語解析には Sudachi を使用します。既存の Python 環境は `SUDACHI_PYTHON` で指定できます。
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
