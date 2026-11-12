import { World } from './scene/World'
import { HUD } from './ui/HUD'
import { GameProvider } from './store/GameProvider'
import { PassDevice } from './ui/PassDevice'
import { Resume } from './ui/Resume'
import { Lobby } from './ui/Lobby'
import { onlineStoreFromUrl } from './net/connect'
import type { OnlineStore } from './store/onlineStore'

// one per page load: StrictMode renders twice in development, and two sockets would take two seats
let online: OnlineStore | null | undefined
const onlineStore = () => (online === undefined ? (online = onlineStoreFromUrl()) : online)
import { BOARD_MODE } from './scene/board'
import { SceneErrorBoundary, SceneStatusNotice, hasWebGL2 } from './scene/SceneGuard'

const webgl = hasWebGL2()

export default function App() {
  // G5.3b: ?room=… plays on the game server; otherwise a local hot-seat game
  const online = onlineStore()
  return (
    <GameProvider store={online ?? undefined}>
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          {webgl && (
            <SceneErrorBoundary>
              <World />
            </SceneErrorBoundary>
          )}
          <SceneStatusNotice initial={webgl ? 'ok' : 'unsupported'} />
        </div>
        <HUD />
      </div>
      {online ? <Lobby /> : <PassDevice />}
      {/* the showcase board (?board=demo) and online games have no saved games */}
      {BOARD_MODE === 'game' && !online && <Resume />}
    </GameProvider>
  )
}
