# MimiFlow

MimiFlow は第二言語習得の循環に基づく学習アプリです：
**インプット -> 想起 -> 交錯練習 -> アウトプット -> 間隔復習**。

リスニング、読解、クイズ、語彙、FSRS 復習、誤答再学習を 1 つの流れで扱います。

## 主な特徴

- 統一ナビゲーションと多言語 UI（日本語/中文/English）
- リスニング・読解中にそのまま語彙保存
- 読解と設問を一体化した表示
- 語彙ノート機能
  - ふりがな
  - 意味
  - 品詞
  - 例文と出典リンク
  - リスト表示 / フラッシュカード表示
- 誤答キュー（24h/72h/7d）
- FSRS パラメータ可視化と復習イベント記録
- FSRS 記憶復習と誤答再学習を分けた復習センター

## 主要ルート

- 学習
  - `/listening` リスニング一覧；`/listening/[id]` リスニング・音読
  - `/reading` 読書ライブラリ；`/reading/articles/[id]` 記事読解
  - `/subtitles/[id]` 字幕付きメディア学習
  - `/practice` 問題演習
  - `/review` 復習センター
  - `/review/memory` FSRS 記憶復習
  - `/review/mistakes` 誤答再学習
  - `/vocabulary` 語彙ノート
- 管理
  - `/manage` 管理トップ
  - `/manage/import` 一括インポート
  - `/manage/listening` リスニング管理
  - `/manage/practice` 試験管理
  - `/manage/import?type=anki` Anki 取込
  - `/manage/system/audio` サイト内音声管理
  - `/manage/system/review` FSRS 管理

## 習得モデル（実装済み）

- 朝: 可理解インプット + 想起サイクル
- 午後: 交錯練習（復習/問題/音読の混合）
- 随時: 期限が来た FSRS 記憶復習と誤答再学習

## 技術スタック

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- FSRS

## ローカル実行

1. 依存関係インストール

```bash
npm install
```

2. Prisma Client 生成

```bash
npx prisma generate
```

3. DB 同期

```bash
npx prisma db push
```

4. 開発サーバー起動

```bash
npm run dev
```

5. 品質チェック

```bash
npx tsc --noEmit
npm run lint
```

## ディレクトリ構成

```text
app/          ルートと server actions
components/   共通 UI
context/      グローバル Provider
hooks/        設定/計測 hooks
modules/      復習・練習・進捗の機能モジュール
prisma/       schema・ローカル DB
utils/        テキスト/言語処理
```

## 他言語

- English: [README.md](./README.md)
- 中文: [README.zh-CN.md](./README.zh-CN.md)
