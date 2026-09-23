import AuthForm from '@/modules/users/components/AuthForm'
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <AuthForm mode='reset' token={token || ''} />
}
