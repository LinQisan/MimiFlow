# MimiFlow

MimiFlow は第二言語習得の循環に基づく学習アプリです：
**インプット -> 想起 -> 交錯練習 -> アウトプット -> 間隔復習**。

リスニング、読解、クイズ、語彙、FSRS 復習、誤答再学習、ゲーム型タスク、AI 出力評価までを 1 つの流れで扱います。

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
- AI 出力ループ
  - プロンプト①: 今日の作文課題を生成
  - プロンプト②: 作文を JSON で定量評価
  - スコアを自動解析しゲーム進捗へ反映

## 主要ルート

- 学習
  - `/lessons/[id]` リスニング・音読
  - `/articles/[id]` 読解＋設問
  - `/quizzes/[id]` 問題演習
  - `/review` 復習
  - `/retry` 誤答再学習
  - `/vocabulary` 語彙ノート
  - `/game` ゲームダッシュボード
  - `/today` 今日の自動学習プラン
- 管理
  - `/manage` 管理トップ
  - `/manage/upload` 一括登録
  - `/manage/audio` サイト内音声管理
  - `/manage/level/*` 分類/教材編集
  - `/manage/import/anki` Anki 取込
  - `/manage/fsrs` FSRS 管理

## 習得モデル（実装済み）

- 朝: 可理解インプット + 想起サイクル
- 午後: 交錯練習（復習/問題/音読の混合）
- 夕方: AI コーチ付きアウトプット課題
- 就寝前: 軽い再生想起
- 翌朝: 遅延想起（默写）

主要タスクはデータから自動提出/自動達成判定され、手動操作を最小化します。

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

## AI 出力タスクの使い方

`/game` の「出力タスク（AI コーチ）」で次の流れを実行します。

1. プロンプト①をコピーして AI に課題生成を依頼
2. 学習者が作文を作成
3. プロンプト②に課題文+作文を入れて AI に JSON 評価を依頼
4. JSON をアプリに貼り付けて保存

記録される定量データ:
- 総合点
- 可理解度
- 正確性
- 複雑性
- 課題達成度
- フィードバック要約/改善アクション

## ディレクトリ構成

```text
app/          ルートと server actions
components/   共通 UI
context/      グローバル Provider
hooks/        設定/計測 hooks
prisma/       schema・migration・ローカル DB
utils/        テキスト/言語処理
```

## 他言語

- English: [README.md](./README.md)
- 中文: [README.zh-CN.md](./README.zh-CN.md)
