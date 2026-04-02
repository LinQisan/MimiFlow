import { getGameDashboard } from '@/app/actions/game'
import GameBoardClient from './GameBoardClient'

export default async function GamePage() {
  const dashboard = await getGameDashboard()
  return <GameBoardClient initial={dashboard} />
}
