// "How to play": the base rules in six lines, folded by default, in the start menu and the help panel.

import { COSTS } from '../game/rules/build'
import { DEFAULT_SETTINGS } from '../game'
import { L } from './locale'
import { resList } from './words'
import { focusRing } from './HUD'

export const ruleLines = () => {
  const win = DEFAULT_SETTINGS.vpToWin
  const limit = DEFAULT_SETTINGS.discardLimit
  return [
    L(`Goal: be the first to ${win} victory points.`, `Цель: первым набрать ${win} победных очков.`),
    L('Start: each player places two settlements and two roads. The second settlement gives its first resources.',
      'Начало: каждый ставит два поселения и две дороги. Второе поселение сразу приносит ресурсы.'),
    L('Your turn: roll the dice. Every tile with that number pays its resource to the settlements (1 card) and cities (2) on its corners.',
      'Ваш ход: бросьте кубики. Каждый гекс с выпавшим числом даёт свой ресурс поселениям (1 карта) и городам (2) на его углах.'),
    L(`Build: road — ${resList(COSTS.road)}; settlement — ${resList(COSTS.settlement)}; city — ${resList(COSTS.city)}; development card — ${resList(COSTS.dev)}. Trade with the bank (4:1), ports or other players.`,
      `Стройка: дорога — ${resList(COSTS.road)}; поселение — ${resList(COSTS.settlement)}; город — ${resList(COSTS.city)}; карта развития — ${resList(COSTS.dev)}. Обмен — с банком (4:1), через порты или с игроками.`),
    L(`A 7: everyone with more than ${limit} cards discards half, then the roller moves the robber. Its tile pays nothing, and the roller steals a card from a player there.`,
      `Выпало 7: у кого больше ${limit} карт, сбрасывает половину. Бросивший переставляет разбойника: его гекс ничего не даёт, а у игрока рядом можно украсть карту.`),
    L('Points: settlement 1, city 2, Longest Road (5+) 2, Largest Army (3+ knights) 2, some development cards 1.',
      'Очки: поселение — 1, город — 2, самая длинная дорога (от 5) — 2, самое большое войско (от 3 рыцарей) — 2, некоторые карты развития — 1.'),
  ]
}

export function Rules({ className = '' }: { className?: string }) {
  return (
    <details data-rules className={`rounded-[10px] bg-white/[0.05] ${className}`}>
      <summary className={`cursor-pointer select-none rounded-[10px] px-[10px] py-[7px] font-display text-[16px] font-semibold text-[#f4efe6] hover:bg-white/10 ${focusRing}`}>
        {L('How to play', 'Как играть')}
      </summary>
      <ol className="list-decimal space-y-[5px] pb-[9px] pl-[28px] pr-[10px] text-[13px] leading-snug text-[#d6d2ca]">
        {ruleLines().map((t) => <li key={t}>{t}</li>)}
      </ol>
    </details>
  )
}
