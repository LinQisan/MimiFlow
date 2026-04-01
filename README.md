# MimiFlow

MimiFlow 是一个面向语言学习的多路由学习平台，围绕「听力、阅读、做题、单词、复习」形成闭环，并提供统一侧边菜单、多语言界面和可扩展的后台管理能力。

## 功能概览

- 听力路由（`/lessons/[id]`）
- 句子级音频播放、循环、跟读
- 句子划词收藏到生词本
- 句子词条区支持注音、释义、释义匹配

- 阅读路由（`/articles/[id]`）
- 文章阅读 + 阅读题一体化布局
- 划词收藏生词，支持来源回链
- 注音/释义开关与词条面板

- 做题路由（`/quizzes/[id]`）
- 支持上一题/下一题切换，最后统一提交
- 支持划词收藏与词条展示

- 生词本路由（`/vocabulary`）
- 语言/分组管理、列表与沉浸模式
- 例句来源展示与跳转
- 例句-释义拖拽匹配（桌面）与点选匹配（移动端）
- 支持多注音、多释义、词性

- 复习路由（`/review`）
- 使用 FSRS 调度句子复习

- 后台路由（`/admin/*`）
- 语料、关卡、上传、词库管理
- 词库支持批量维护：注音、词性、释义

## 注音与词条能力

- 日语支持汉字与假名混写的注音展示（仅对汉字核心注音）
- 英语支持音标展示
- 注音、释义均可按开关控制显示/隐藏
- 词条信息支持多值保存：
- `pronunciations`（注音/音标）
- `partsOfSpeech`（词性）
- `meanings`（释义）

## 技术栈

- Next.js（App Router）
- React + TypeScript
- Tailwind CSS
- Prisma + SQLite（`prisma/dev.db`）
- FSRS（句子复习调度）

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 生成 Prisma Client

```bash
npx prisma generate
```

3. （首次）同步数据库结构

```bash
npx prisma db execute --file prisma/migrations/20260401222529_add_vocabulary_meta_lists/migration.sql
npx prisma db execute --file prisma/migrations/20260402000500_add_vocabulary_parts_of_speech/migration.sql
```

4. 启动开发服务器

```bash
npm run dev
```

5. 类型检查

```bash
npx tsc --noEmit
```

## 目录结构（简）

```text
app/                  # 路由与页面
components/           # UI 组件
context/              # 全局上下文（对话框、i18n）
hooks/                # 状态与偏好 Hook
prisma/               # schema 与迁移
utils/                # 工具函数（含日语注音处理）
```

## 说明

- 本仓库当前包含本地 SQLite 数据库文件与部分音频资源文件，适合本地开发和演示。
- 生产部署前建议将数据库与静态资源托管策略独立化。
