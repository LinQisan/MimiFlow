# MimiFlow

MimiFlow 是一个围绕二语习得闭环构建的语言学习应用：
**输入 -> 提取 -> 交错练习 -> 输出 -> 间隔复习**。

项目整合听力、阅读、做题、生词、复习、错题回流、游戏任务和 AI 输出评估，尽量让学习过程“少手动、可量化、可持续”。

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
- 输出任务闭环：
  - 提示词① 生成输出目标
  - 提示词② 评改作文并返回 JSON
  - 系统自动解析分数并计入游戏进度

## 路由概览

- 学习侧
  - `/lessons/[id]` 听力与跟读
  - `/articles/[id]` 阅读与文章做题
  - `/quizzes/[id]` 题库练习
  - `/review` 复习
  - `/retry` 错题回流
  - `/vocabulary` 生词本
  - `/game` 游戏系统与学习闭环面板
  - `/today` 今日任务自动编排
- 管理侧
  - `/manage` 管理首页
  - `/manage/upload` 统一录入
  - `/manage/audio` 站内录音管理
  - `/manage/level/*` 分类与内容维护
  - `/manage/import/anki` Anki 导入
  - `/manage/fsrs` FSRS 面板

## 习得逻辑（系统内已落地）

- 早上：可理解输入 + 提取循环
- 下午：交错练习（复习/做题/听读混排）
- 傍晚：AI 输出任务（自动量化）
- 睡前：轻回顾
- 次晨：延迟默写

核心任务会基于行为数据自动提交或自动结算，减少额外打卡操作。

## 技术栈

- Next.js（App Router）
- React + TypeScript
- Tailwind CSS
- Prisma + SQLite（`prisma/dev.db`）
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

3. 同步本地数据库结构

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

## AI 输出任务使用方式

在 `/game` 的“输出任务（AI教练）”中：

1. 点击复制提示词①，让 AI 生成当日写作目标  
2. 完成作文后，点击复制提示词②，让 AI 输出严格 JSON 评改  
3. 把“输出目标 + 作文 + JSON 评改”粘贴回系统保存  

系统会记录：
- 综合分
- 可理解度
- 准确度
- 复杂度
- 完成度
- 建议总结与下一步行动项

## 目录结构

```text
app/          路由与 server actions
components/   通用组件
context/      全局 Provider
hooks/        偏好/遥测 hooks
prisma/       schema/迁移/本地数据库
utils/        文本与语言工具函数
```

## 其他语言

- English: [README.md](./README.md)
- 日本語: [README.ja.md](./README.ja.md)
