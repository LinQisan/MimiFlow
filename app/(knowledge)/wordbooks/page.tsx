import { redirect } from 'next/navigation'

export default function WordbooksPage() {
  redirect('/vocabulary?view=wordbooks')
}
