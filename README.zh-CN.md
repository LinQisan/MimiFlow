# MimiFlow

MimiFlow 是一个语言学习 Web 应用，围绕完整学习闭环构建：
**听力 -> 阅读 -> 做题 -> 生词 -> 复习**。
项目提供统一菜单、多语言界面，以及面向内容运营的管理工作台。

## 核心功能

- 听力（`/lessons/[id]`）
- 句子级音频播放与循环训练
- 从句子上下文划词收藏
- 词条面板支持注音、释义、词性

- 阅读（`/articles/[id]`）
- 阅读与题目一体化流程
- 划词收藏并支持来源回链
- 注音/释义开关控制

- 题库（`/quizzes/[id]`）
- 多种做题模式与最终提交流程
- 从题目语境划词收藏

- 生词本（`/vocabulary`）
- 按语言/收藏夹管理
- 列表模式与闪卡模式
- 支持多值元数据：
  - `pronunciations`
  - `partsOfSpeech`
  - `meanings`
- 例句来源与跳转

- 复习（`/review`）
- 基于 FSRS 的句子复习调度

- 管理端（`/manage/*`）
- 听力/阅读/题目录入与维护
- 录音文件管理（移动、重命名、批量操作）
- 生词维护

## 技术栈

- Next.js（App Router）
- React + TypeScript
- Tailwind CSS
- Prisma + SQLite（`prisma/dev.db`）
- FSRS（复习调度）

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 生成 Prisma Client

```bash
npx prisma generate
```

3. 同步本地 SQLite 结构

```bash
npx prisma db push
```

4. 启动开发服务

```bash
npm run dev
```

5. 类型检查

```bash
npx tsc --noEmit
```

## 目录结构

```text
app/            # 路由与页面
components/     # 通用组件
context/        # 全局 Provider（弹窗、i18n）
hooks/          # 公共 hooks
prisma/         # schema、迁移、本地 sqlite 数据库
utils/          # 工具模块
```

## 说明

- 仓库当前包含本地 SQLite 数据库与静态资源，便于本地开发与演示。
- 生产环境建议将数据库与静态文件策略独立部署。

## 其他语言

- English: [README.md](./README.md)
- 日本語: [README.ja.md](./README.ja.md)
