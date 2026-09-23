# MimiFlow

整合听力、跟读、阅读、做题、生词本和 FSRS 间隔复习的语言学习应用。

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[English](README.md) · [日本語](README.ja.md)

## 本地运行

需要 Node.js 22–26、Rust 1.88+ 和 PostgreSQL。先在 `.env.local` 中设置 `DATABASE_URL`，再运行：

```sh
npm ci
npm run db:push
npm run dev
```

访问 [localhost:3000](http://localhost:3000)，内容管理入口为 `/manage`。
现在需要邮箱和密码登录。注册支持 `REGISTRATION_MODE=disabled|invite|open`，当前本机使用邀请码模式；邮件配置和使用方法见[账户注册说明](docs/registration.md)。新账户默认不是管理员，无法进入 `/manage`。已有旧用户可在确认准确用户 ID 后，通过 `MIMIFLOW_CLAIM_PASSWORD` 和 `npm run user:claim -- <用户ID> <邮箱>` 关联邮箱。
单词书及书内词条对所有账户共享，由管理员维护；未加入单词书的个人单词、词汇复习卡和做题记录按账户隔离。
联网使用时应通过 HTTPS 提供服务，并保护数据库连接信息。登录会话保存在数据库中，退出时立即失效。
`npm ci` 自动生成 Prisma 客户端；修改 schema 后执行 `npm run db:generate` 和 `npm run db:push`。
Sudachi 通过 Rust Node-API 扩展在进程内运行，`npm ci` 自动编译并安装固定版本的 full 词典，详见[原生模块说明](modules/language/native/README.md)。
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
