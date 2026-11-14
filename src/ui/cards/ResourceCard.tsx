// A resource card face (hand): a tall parchment card with the biome's landscape and the item filling
// the window, the count in the corner and the name on the paper below, like the development cards.
import type { Resource } from '../../game'
import { PARCHMENT_FRAME, ResourceBackdrop } from './ResourceArt'
import { ResourceItem } from './ResourceItems'

/** Card sizes: the hand (88×116 before; now a portrait 80×110) and the compact dock (58×80). */
export const RES_CARD = {
  full: 'h-[110px] w-[80px] rounded-[9px] p-[4px] shadow-[0_10px_22px_rgba(0,0,0,0.6)]',
  compact: 'h-[80px] w-[58px] rounded-[7px] p-[3px] shadow-[0_6px_14px_rgba(0,0,0,0.55)]',
}
export const RES_CARD_FRAME = `relative flex flex-col ${PARCHMENT_FRAME}`

export function ResourceCardFace({ res, name, count, chosen = 0, compact = false }: {
  res: Resource; name: string; count: number; chosen?: number; compact?: boolean
}) {
  return (
    <>
      <span className={`relative block min-h-0 flex-1 overflow-hidden ${compact ? 'rounded-[5px]' : 'rounded-[6px]'} shadow-[inset_0_0_0_1px_rgba(90,60,25,0.6)]`}>
        <ResourceBackdrop res={res} />
        <ResourceItem res={res} className={`absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_2px_1.5px_rgba(0,0,0,0.4)] ${compact ? 'w-[56px]' : 'w-[78px]'}`} />
        <span aria-hidden className={`absolute grid place-items-center rounded-[5px] bg-[#1d1a16]/85 font-bold text-white ring-1 ring-[#f2cf84]/60 ${compact ? 'left-[2px] top-[2px] h-[19px] min-w-[19px] px-[3px] text-[12.5px]' : 'left-[3px] top-[3px] h-[22px] min-w-[22px] px-[4px] text-[14px]'}`}>{count}</span>
        {chosen > 0 && <span aria-hidden className={`absolute rounded-[4px] bg-[#f2b544] font-bold leading-none text-[#2a1a06] shadow-[0_1px_3px_rgba(0,0,0,.5)] ${compact ? 'right-[2px] top-[2px] px-[3px] py-[3px] text-[11px]' : 'right-[3px] top-[3px] px-[4px] py-[4px] text-[12px]'}`}>×{chosen}</span>}
      </span>
      <span aria-hidden className={`block truncate text-center font-display font-semibold leading-none text-[#2b2118] ${compact ? 'pt-[3px] pb-[1px] text-[10.5px]' : 'pt-[4px] pb-[1px] text-[12.5px]'}`}>{name}</span>
    </>
  )
}
