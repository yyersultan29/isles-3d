import { World } from './scene/World'
import { HUD } from './ui/HUD'
import { GameProvider } from './store/GameProvider'
import { SceneErrorBoundary, SceneStatusNotice, hasWebGL2 } from './scene/SceneGuard'

const webgl = hasWebGL2()

export default function App() {
  return (
    <GameProvider>
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
    </GameProvider>
  )
}
