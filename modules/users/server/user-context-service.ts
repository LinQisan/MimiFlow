import 'server-only'

import {
  getCurrentUser,
  listUsers,
} from '@/modules/users/server/current-user'

export async function getUserContext() {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    listUsers(),
  ])
  return { currentUser, users }
}
