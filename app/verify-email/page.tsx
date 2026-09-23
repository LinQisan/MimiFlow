import AuthForm from '@/modules/users/components/AuthForm'
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <AuthForm mode='verify' token={token || ''} />
}
