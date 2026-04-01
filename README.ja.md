# MimiFlow

MimiFlow は、次の学習サイクルを中心に設計された言語学習 Web アプリです：
**リスニング -> リーディング -> クイズ -> 語彙 -> 復習**。
統一メニュー、多言語 UI、そして運用向け管理画面を提供します。

## 主な機能

- リスニング（`/lessons/[id]`）
- 文単位の音声再生とループ練習
- 文脈から単語を選択して語彙保存
- 語彙パネルでふりがな・意味・品詞を表示

- リーディング（`/articles/[id]`）
- 読解と設問を一体化した学習フロー
- 単語保存時の出典リンク保持
- ふりがな/意味の表示切替

- クイズ（`/quizzes/[id]`）
- 複数モードの出題と最終提出
- 問題文脈からの単語保存

- 語彙（`/vocabulary`）
- 言語/フォルダ単位で管理
- リスト表示とフラッシュカード表示
- 複数値メタデータ対応：
  - `pronunciations`
  - `partsOfSpeech`
  - `meanings`
- 例文の出典表示と遷移

- 復習（`/review`）
- FSRS ベースの文復習スケジューリング

- 管理（`/manage/*`）
- リスニング/読解/問題データの登録・編集
- 音声ファイル管理（移動・リネーム・一括操作）
- 語彙データ管理

## 技術スタック

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Prisma + SQLite (`prisma/dev.db`)
- FSRS（復習スケジューラ）

## ローカル起動

1. 依存関係のインストール

```bash
npm install
```

2. Prisma Client の生成

```bash
npx prisma generate
```

3. ローカル SQLite スキーマの同期

```bash
npx prisma db push
```

4. 開発サーバー起動

```bash
npm run dev
```

5. 型チェック

```bash
npx tsc --noEmit
```

## ディレクトリ構成

```text
app/            # ルーティングとページ
components/     # 共通 UI コンポーネント
context/        # グローバル Provider（dialog, i18n）
hooks/          # 共通 hooks
prisma/         # schema・migration・ローカル sqlite DB
utils/          # ユーティリティ
```

## 備考

- ローカル開発/デモ向けに SQLite DB と静的アセットを含んでいます。
- 本番環境では DB と静的ファイル配信を分離することを推奨します。

## 他言語

- English: [README.md](./README.md)
- 中文: [README.zh-CN.md](./README.zh-CN.md)
