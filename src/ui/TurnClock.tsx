// The online turn timer (ROADMAP G5.5, GAME_DESIGN §20): the time left for the decision the game
// waits for, shown next to the phase line. Updates once a second (DOM only, never the 3D scene).
// The visible digits are hidden from screen readers; this seat hears one "10 seconds left".

import { useEffect, useState } from 'react'
import { useSeat, useSession } from '../store/GameProvider'

/** Whole seconds left on the running turn timer, or null without one. */
export function useTurnClock(): { seconds: number; mine: boolean } | null {
  const session = useSession()
  const me = useSeat()
  const timer = session?.status === 'playing' ? session.timer : null
  const left = () => (timer ? Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000)) : 0)
  const [seconds, setSeconds] = useState(left)
  useEffect(() => {
    if (!timer) return
    setSeconds(left())
    const id = setInterval(() => setSeconds(left()), 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer])
  if (!timer) return null
  return { seconds, mine: !!me && me !== 'spectator' && timer.seats.includes(me) }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function TurnClock() {
  const clock = useTurnClock()
  if (!clock) return null
  const urgent = clock.mine && clock.seconds <= 10
  return (
    <>
      <span aria-hidden className={`ml-[8px] shrink-0 whitespace-nowrap tabular-nums ${urgent ? 'text-[#ff9b7a]' : 'text-[#c9c3b8]'}`}>· {fmt(clock.seconds)}</span>
      {/* the same text while it lasts, so a screen reader announces it once */}
      {urgent && clock.seconds > 0 && <span role="status" className="sr-only">10 seconds left</span>}
    </>
  )
}
