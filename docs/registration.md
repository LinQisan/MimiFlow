# 账户注册与邮件

在 `.env.local` 或部署环境中设置 `REGISTRATION_MODE=disabled|invite|open`。当前本机配置为 `invite`；改成 `open` 即可开放无需邀请码的注册，改成 `disabled` 则关闭注册。模式始终由服务端检查。

配置邮件：

```text
APP_BASE_URL=https://your-mimiflow.example
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=MimiFlow <no-reply@example.com>
```

465 端口使用隐式 TLS，其他端口要求 STARTTLS。生产环境的 `APP_BASE_URL` 必须是 HTTPS，链接不会从请求的 Host 头构造。不要将 SMTP 密码提交到仓库。未配置 SMTP 时，网页注册会返回暂时不可用，也不会消耗邀请码。

管理员登录后在 `/manage/system/invites` 生成邀请码，可选 1–90 天有效期。每个码只能使用一次；只有生成时会显示明文，数据库保存 SHA-256 摘要。列表显示创建者、创建时间、使用者、使用时间、到期与撤销状态。未使用的邀请码可以撤销。邀请码使用和账户创建在同一数据库事务中，条件更新阻止并发重复使用。`open` 模式下不需要邀请码。

管理员页面不提供查看或编辑用户密码的功能。密码只保存 scrypt 摘要；用户通过自己的邮箱使用一次性链接重置密码。

新账户必须点击邮件中的一次性验证链接才能登录。验证链接有效 24 小时；重置密码链接有效 30 分钟。邮件中的链接先打开确认页，提交后才消耗令牌。忘记密码、重发验证邮件均返回统一文案；重置密码后所有旧会话失效。历史账户不被自动认定为邮箱已验证，并维持此前的登录资格。历史账户可使用“重发验证邮件”完成验证；若通过邮箱链接完成密码重置，也会同时验证该邮箱。

认证接口使用数据库中的 IP 与邮箱双维度限流。若应用位于可信反向代理之后，可设置 `AUTH_TRUST_PROXY=1`，并确保代理覆盖传入的 `X-Forwarded-For`，且应用服务端口不能被绕过代理直接访问。未设置时，IP 维度采用共享兜底桶，邮箱维度仍独立限流。公开注册后可按流量情况增加 CAPTCHA 或专门的限流基础设施。
