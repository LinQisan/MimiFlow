# MimiFlow

整合听力、跟读、阅读、做题、生词本和 FSRS 间隔复习的语言学习应用。

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[English](README.md) · [日本語](README.ja.md)

## 本地运行

需要 Node.js 22–26、Python 3 和 PostgreSQL。先在 `.env.local` 中设置 `DATABASE_URL`，再运行：

```sh
npm ci
npm run sudachi:setup
npm run db:push
npm run dev
```

访问 [localhost:3000](http://localhost:3000)，内容管理入口为 `/manage`。
`npm ci` 自动生成 Prisma 客户端；修改 schema 后执行 `npm run db:generate` 和 `npm run db:push`。
Sudachi 提供日语文本分析，可用 `SUDACHI_PYTHON` 指定已有 Python 环境。
macOS 开发启动支持自动启动 Homebrew PostgreSQL；安装多个版本时可设置 `POSTGRES_SERVICE`。

## 项目结构

- `app/`：页面、布局和 API 路由
- `modules/`：业务领域、服务、hooks 和业务界面
- `components/`、`context/`、`hooks/`：共享界面和应用状态
- `lib/`、`utils/`：基础设施、编解码、现有仓储和工具函数
- `prisma/`：数据库模型；`scripts/`：测试与维护脚本

新增领域和持久化逻辑放在 `modules/`。工程约定见 [AGENTS.md](AGENTS.md)，界面规范见 [DESIGN.md](DESIGN.md)。

## 验证

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
