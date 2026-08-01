# MimiFlow

MimiFlow 是一个围绕二语习得闭环构建的语言学习应用：
**输入 -> 提取 -> 交错练习 -> 输出 -> 间隔复习**。

项目整合听力、阅读、做题、生词、FSRS 记忆复习和错题巩固，尽量让学习过程“少手动、可量化、可持续”。

## 主要特性

- 统一菜单与多语言界面（中文/日文/英文）
- 听力与阅读中可直接划词收录
- 阅读与题目一体化（含填空题占位符渲染）
- 生词本支持：
  - 注音
  - 释义
  - 词性
  - 例句与来源回链
  - 列表与闪卡模式
- 错题回流队列（24h/72h/7d）
- FSRS 参数管理与复习事件日志
- 复习中心明确区分：
  - 单词与句子的 FSRS 记忆复习
  - 24h/72h/7d 错题巩固

## 路由概览

- 学习侧
  - `/listening` 听力库；`/listening/[id]` 听力与跟读
  - `/reading` 阅读库；`/reading/articles/[id]` 文章阅读
  - `/subtitles/[id]` 字幕媒体学习
  - `/practice` 题库练习
  - `/review` 复习中心
  - `/review/memory` 单词与句子复习
  - `/review/mistakes` 错题巩固
  - `/vocabulary` 生词本
- 管理侧
  - `/manage` 管理首页
  - `/manage/import` 统一导入
  - `/manage/listening` 听力管理
  - `/manage/practice` 试卷管理
  - `/manage/import?type=anki` Anki 导入
  - `/manage/system/audio` 站内音频管理
  - `/manage/system/review` FSRS 面板

## 习得逻辑（系统内已落地）

- 早上：可理解输入 + 提取循环
- 下午：交错练习（复习/做题/听读混排）
- 随时：到期记忆复习与错题巩固

## 技术栈

- Next.js（App Router）
- React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- FSRS 复习调度

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 生成 Prisma Client

```bash
npx prisma generate
```

3. 同步数据库结构

```bash
npx prisma db push
```

4. 启动开发服务

```bash
npm run dev
```

5. 质量检查

```bash
npx tsc --noEmit
npm run lint
```

## 目录结构

```text
app/          路由与 server actions
components/   通用组件
context/      全局 Provider
hooks/        偏好/遥测 hooks
modules/      按业务组织的复习、练习与进度模块
prisma/       schema/本地数据库
utils/        文本与语言工具函数
```

## 其他语言

- English: [README.md](./README.md)
- 日本語: [README.ja.md](./README.ja.md)
