// Russian polish: every game-log line and event notice of the golden games is Russian (a review found
// "Красный rolled 5"); the seat names are left out, since a player may type a Latin name.
import { afterAll, expect, it } from 'vitest'
import { apply, createGame, type ReplayFile } from '../../game'
import { logLines } from '../gameLog'
import { boughtNotice, eventNotices, ownRollNotice } from '../noticeQueue'
import { SEATS } from '../gameView'
import { setLocale } from '../locale'

afterAll(() => setLocale('en'))

it('golden games read in Russian: no English words in the log or the notices', () => {
  setLocale('ru')
  const files = import.meta.glob('../../game/__tests__/golden/*.json', { eager: true, import: 'default' }) as Record<string, ReplayFile>
  const names = Object.values(SEATS).map((s) => s.name)
  const bad = new Set<string>()
  let lines = 0
  for (const f of Object.values(files)) {
    const g = createGame(f.settings)
    if (!g.ok) throw new Error('createGame')
    let s = g.state
    for (const { player, action } of f.actions) {
      const r = apply(s, player, action)
      if (!r.ok) throw new Error(r.error.code)
      const texts = [
        ...logLines(r.events, s.board.tiles).map((l) => l.text),
        ...eventNotices(r.events).map((n) => n.text),
        ownRollNotice(r.events, player)?.text, boughtNotice(r.events, player)?.text,
      ]
      s = r.state
      for (const t of texts) {
        if (!t) continue
        lines++
        const rest = names.reduce((x, n) => x.split(n).join(''), t)
        if (/[A-Za-z]{2,}/.test(rest)) bad.add(t)
      }
    }
  }
  expect(lines).toBeGreaterThan(500)
  expect([...bad]).toEqual([])
})
