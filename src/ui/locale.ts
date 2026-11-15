// Interface language (ROADMAP G9.4, docs/G9_PLAN.md). Two locales, English and Russian. Strings stay
// next to their use as pairs, `L('Trade', 'Торговля')`, so a change to one language is made beside the
// other and nothing goes missing in a separate table. `plural` gives the Russian number forms.
//
// The first language is `?lang=en|ru`, else the device's stored choice, else the browser's language
// (Russian for ru-*, English otherwise). App re-mounts the HUD on a change, and pure text functions
// (phase line, log, notices, reasons) read the locale when they run.

import { useSyncExternalStore } from 'react'

export type Locale = 'en' | 'ru'
export const LOCALES: { id: Locale; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'ru', label: 'RU', name: 'Русский' },
]
const KEY = 'isles3d.lang'

function initial(): Locale {
  if (typeof window === 'undefined') return 'en'
  const q = new URLSearchParams(window.location.search).get('lang')
  if (q === 'en' || q === 'ru') return q
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'ru') return v
  } catch { /* storage blocked: fall through to the browser */ }
  return /^ru\b/i.test(navigator.language ?? '') ? 'ru' : 'en'
}

let locale: Locale = initial()
if (typeof document !== 'undefined') document.documentElement.lang = locale
const listeners = new Set<() => void>()

export const getLocale = () => locale

export function setLocale(l: Locale) {
  if (l === locale) return
  locale = l
  try { localStorage.setItem(KEY, l) } catch { /* not remembered */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l
  for (const f of [...listeners]) f()
}

export function onLocale(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }
export function useLocale(): Locale { return useSyncExternalStore(onLocale, getLocale, () => 'en' as Locale) }

/** The string for the current language. */
export const L = (en: string, ru: string) => (locale === 'ru' ? ru : en)

/** Russian number form: 1 карта, 2 карты, 5 карт (21 карта, 11 карт). */
export function ruPlural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

/** "3 cards" / "3 карты": the number and its noun in the current language. */
export const count = (n: number, en1: string, enN: string, ru1: string, ru2: string, ru5: string) =>
  `${n} ${locale === 'ru' ? ruPlural(n, ru1, ru2, ru5) : n === 1 ? en1 : enN}`
