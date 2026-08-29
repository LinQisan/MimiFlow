# MimiFlow

MimiFlow 是一个语言学习应用，整合听力、跟读、阅读、做题、生词管理和间隔复习。

## 主要功能

- 按句播放听力与跟读，支持当前句词汇提示
- 阅读和字幕学习，支持划词收录
- 可变选项数量的题目、试卷练习与错题复习
- 生词本和基于 FSRS 的记忆复习
- 内容、音频、分类和导入管理

## 技术栈

Next.js 16、React 19、TypeScript、Tailwind CSS、Prisma、PostgreSQL 和 ts-fsrs。

## 本地运行

需要 Node.js 22–26、Python 3 和 PostgreSQL。

```bash
npm install
npm run sudachi:setup
npm run db:generate
npm run db:push
npm run dev
```

运行数据库命令前，请在 `.env.local` 中设置 `DATABASE_URL`。
`sudachi:setup` 会在项目的 `.venv` 中安装 SudachiPy 与 full 日语词典，供文章注音、原形识别和词频统计使用；也可通过 `SUDACHI_PYTHON` 指定已有的 Python 环境。
在 macOS 上通过 Homebrew 安装 PostgreSQL 时，`npm run dev` 会检查本地数据库，
并在数据库未运行时自动启动对应的 Homebrew 服务。若安装了多个 PostgreSQL
版本，可在 `.env.local` 中用 `POSTGRES_SERVICE` 指定服务名，例如 `postgresql@16`。

## 检查命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 主要入口

- `/listening`、`/reading`、`/subtitles`、`/practice`
- `/vocabulary`、`/review`
- `/manage` 内容管理

## 其他语言

- [English](./README.md)
- [日本語](./README.ja.md)
