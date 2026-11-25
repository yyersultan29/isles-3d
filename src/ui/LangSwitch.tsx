// G9.4: the language switch (EN / RU), in the start menu, the help panel and the online lobby.
import { LOCALES, setLocale, useLocale } from './locale'
import { focusRing } from './tokens'

export function LangSwitch({ className = '' }: { className?: string }) {
  const current = useLocale()
  return (
    <div role="group" aria-label="Language / Язык" className={`flex items-center gap-[6px] ${className}`}>
      <span aria-hidden className="text-[12px] text-[#a9a49b]">{current === 'ru' ? 'Язык' : 'Language'}</span>
      <div className="flex overflow-hidden rounded-[8px] ring-1 ring-white/15">
        {LOCALES.map((l) => (
          <button key={l.id} type="button" lang={l.id} aria-pressed={current === l.id} aria-label={l.name} data-lang={l.id}
            onClick={() => setLocale(l.id)}
            className={`h-[28px] px-[10px] text-[12.5px] font-bold ${current === l.id ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/5 text-[#d6d2ca] hover:bg-white/15'} ${focusRing}`}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
