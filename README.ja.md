# MimiFlow

MimiFlow は、リスニング、シャドーイング、読解、問題演習、語彙管理、間隔反復をまとめた語学学習アプリです。

## 主な機能

- 文単位の音声再生とシャドーイング、現在文の語彙表示
- 読解・字幕学習と選択語彙の保存
- 選択肢数を変更できる問題、試験演習、誤答復習
- 語彙ノートと FSRS による記憶復習
- コンテンツ、音声、分類、インポートの管理

## 技術スタック

Next.js 16、React 19、TypeScript、Tailwind CSS、Prisma、PostgreSQL、ts-fsrs。

## ローカル実行

Node.js 22–24 と PostgreSQL が必要です。

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

データベースコマンドの実行前に、`.env.local` に `DATABASE_URL` を設定してください。
macOS で Homebrew 版 PostgreSQL を使用する場合、`npm run dev` はローカル
データベースを確認し、停止中なら Homebrew サービスを自動起動します。複数の
PostgreSQL がある場合は `.env.local` の `POSTGRES_SERVICE` で指定できます
（例: `postgresql@16`）。

## チェック

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 主なルート

- `/listening`、`/reading`、`/subtitles`、`/practice`
- `/vocabulary`、`/review`
- `/manage` コンテンツ管理

## 他言語

- [English](./README.md)
- [简体中文](./README.zh-CN.md)
