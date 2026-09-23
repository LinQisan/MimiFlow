import { NextResponse, type NextRequest } from 'next/server'
import { readSessionUser, SESSION_COOKIE } from '@/modules/users/server/auth'

const publicAuthRoutes = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/invite', '/api/auth/verify-email', '/api/auth/resend-verification', '/api/auth/request-reset', '/api/auth/reset-password'])
const publicPages = new Set(['/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/resend-verification'])

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (publicAuthRoutes.has(pathname)) {
    if (request.method !== 'POST' || request.headers.has('next-action')) {
      return new Response(null, { status: 405 })
    }
    return NextResponse.next()
  }
  if (publicPages.has(pathname) && request.method !== 'GET') {
    return new Response(null, { status: 405 })
  }

  const user = await readSessionUser(request.cookies.get(SESSION_COOKIE)?.value)
  if (publicPages.has(pathname)) {
    return user && (pathname === '/login' || pathname === '/register')
      ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next()
  }
  if (user && (pathname === '/manage' || pathname.startsWith('/manage/') || pathname.startsWith('/api/manage/')) && !user.isAdmin) {
    if (pathname.startsWith('/api/') || request.method !== 'GET') {
      return NextResponse.json({ message: '没有管理权限。' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/', request.url))
  }
  if (user) return NextResponse.next()
  if (pathname.startsWith('/api/') || request.method !== 'GET') {
    return NextResponse.json({ message: '请先登录。' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|favicon.ico|icon.svg).*)'],
}
