import 'server-only'

import nodemailer from 'nodemailer'

export function assertMailConfigured() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || '587')
  const from = process.env.SMTP_FROM
  const base = process.env.APP_BASE_URL
  if (!host || !from || !base || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('邮件服务未配置。请设置 SMTP_HOST、SMTP_PORT、SMTP_FROM 和 APP_BASE_URL。')
  }
  if (process.env.NODE_ENV === 'production' && new URL(base).protocol !== 'https:') throw new Error('APP_BASE_URL 必须使用 HTTPS。')
  return { host, port, from, base }
}

export async function sendAuthMail(email: string, kind: 'verify' | 'reset', token: string) {
  const { host, port, from, base } = assertMailConfigured()
  const url = new URL(kind === 'verify' ? '/verify-email' : '/reset-password', base)
  url.searchParams.set('token', token)
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
  })
  await transport.sendMail({
    from, to: email,
    subject: kind === 'verify' ? '验证 MimiFlow 邮箱' : '重置 MimiFlow 密码',
    text: kind === 'verify' ? `请在 24 小时内打开链接验证邮箱：\n${url}` : `请在 30 分钟内打开链接重置密码：\n${url}`,
  })
}
