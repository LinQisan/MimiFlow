import AuthForm from '@/modules/users/components/AuthForm'
import { registrationMode } from '@/modules/users/domain/registration'
import Link from 'next/link'
export default function RegisterPage() {
  const mode = registrationMode()
  if (mode === 'disabled') return <main className='mx-auto max-w-md px-6 py-16'><h1 className='text-2xl font-semibold'>当前不开放注册</h1><Link href='/login' className='mt-6 inline-block underline'>返回登录</Link></main>
  return <AuthForm mode='register' invite={mode === 'invite'} />
}
