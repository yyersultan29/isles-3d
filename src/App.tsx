import { World } from './scene/World'
import { HUD } from './ui/HUD'
import { GameProvider } from './store/GameProvider'
import { PassDevice } from './ui/PassDevice'
import { Resume } from './ui/Resume'
import { StartMenu, menuAtStart } from './ui/StartMenu'
import { Lobby } from './ui/Lobby'
import { useLocale } from './ui/locale'
import { onlineStoreFromUrl } from './net/connect'
import type { OnlineStore } from './store/onlineStore'

// one per page load: StrictMode renders twice in development, and two sockets would take two seats
let online: OnlineStore | null | undefined
const onlineStore = () => (online === undefined ? (online = onlineStoreFromUrl()) : online)
import { BOARD_MODE } from './scene/board'
import { SceneErrorBoundary, SceneStatusNotice, hasWebGL2 } from './scene/SceneGuard'

const webgl = hasWebGL2()
const atStart = menuAtStart()

export default function App() {
  // G5.3b: ?room=… plays on the game server; otherwise a local hot-seat game
  const online = onlineStore()
  // G9.4: a language change re-mounts the HUD and the turn screens, so every label is read again
  const locale = useLocale()
  return (
    <GameProvider store={online ?? undefined}>
      {/* G5.6b: the game is the page's main landmark (screen-reader navigation) */}
      <main aria-label="Isles 3D" className="relative h-full w-full">
        <div className="absolute inset-0">
          {webgl && (
            <SceneErrorBoundary>
              <World />
            </SceneErrorBoundary>
          )}
          <SceneStatusNotice initial={webgl ? 'ok' : 'unsupported'} />
        </div>
        <HUD key={locale} />
      </main>
      {online ? <Lobby key={locale} /> : <PassDevice key={locale} />}
      {/* the showcase board (?board=demo) and online games have no saved games */}
      {/* G9.3: a plain URL opens the start menu (which offers the saved game); any URL option keeps the old card */}
      {BOARD_MODE === 'game' && !online && <StartMenu atStart={atStart} />}
      {BOARD_MODE === 'game' && !online && !atStart && <Resume />}
    </GameProvider>
  )
}
