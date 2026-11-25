// PERF P4: the Graphics setting (Auto / High / Medium / Low), in the start menu and the help panel.
// Lower settings run cooler and quieter on laptops; Auto steps down by itself when High can't keep up.
import { GRAPHICS_SETTINGS, setGraphics, useGraphicsSetting, useQuality, type GraphicsSetting } from '../scene/quality'
import { L } from './locale'
import { focusRing } from './tokens'

const NAMES: Record<GraphicsSetting, () => string> = {
  auto: () => L('Auto', 'Авто'),
  high: () => L('High', 'Высокая'),
  medium: () => L('Medium', 'Средняя'),
  low: () => L('Low', 'Низкая'),
}

export function GraphicsSwitch({ className = '' }: { className?: string }) {
  const current = useGraphicsSetting()
  const q = useQuality()
  return (
    <div className={className}>
      <div role="group" aria-label={L('Graphics', 'Графика')} className="flex flex-wrap items-center gap-[6px]">
        <span aria-hidden className="text-[12px] text-[#a9a49b]">{L('Graphics', 'Графика')}</span>
        <div className="flex overflow-hidden rounded-[8px] ring-1 ring-white/15">
          {GRAPHICS_SETTINGS.map((s) => (
            <button key={s} type="button" aria-pressed={current === s} data-graphics={s}
              onClick={() => setGraphics(s)}
              className={`h-[28px] px-[9px] text-[12.5px] font-bold ${current === s ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/5 text-[#d6d2ca] hover:bg-white/15'} ${focusRing}`}>
              {NAMES[s]()}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-[4px] text-[11.5px] text-[#a9a49b]" data-graphics-note>
        {current === 'auto'
          ? L(`Now: ${NAMES[q.name]()}. Lowers itself if the game can't stay smooth.`, `Сейчас: ${NAMES[q.name]().toLowerCase()}. Снижается сама, если игра не успевает.`)
          : L('Lower = quieter and cooler laptop.', 'Ниже — тише и холоднее ноутбук.')}
      </p>
    </div>
  )
}
