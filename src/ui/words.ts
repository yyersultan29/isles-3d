// Game vocabulary in both languages (ROADMAP G9.4): resources, cards, awards, pieces, terrains and
// colours, with Russian number forms. Every screen and text function takes its words from here.

import { RESOURCE_ORDER, type DevCardType, type PlayerId, type Resource, type Terrain } from '../game'
import { L, getLocale, ruPlural } from './locale'

const RES_EN: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
// nominative, then the forms after 2–4 and after 5+
const RES_RU: Record<Resource, [string, string, string]> = {
  lumber: ['дерево', 'дерева', 'дерева'], brick: ['кирпич', 'кирпича', 'кирпичей'], wool: ['шерсть', 'шерсти', 'шерсти'],
  grain: ['зерно', 'зерна', 'зерна'], ore: ['руда', 'руды', 'руды'],
}

/** "wood" / "дерево" (lower case, for sentences). */
export const resName = (r: Resource) => (getLocale() === 'ru' ? RES_RU[r][0] : RES_EN[r])
/** "Wood" / "Дерево" (card labels). */
export const resTitle = (r: Resource) => { const n = resName(r); return n[0].toUpperCase() + n.slice(1) }
/** "2 wood" / "2 дерева". */
export const resCount = (n: number, r: Resource) => `${n} ${getLocale() === 'ru' ? ruPlural(n, ...RES_RU[r]) : RES_EN[r]}`
/** "2 wood, 1 ore" / "2 дерева, 1 руда". */
export const resList = (c: Partial<Record<Resource, number>>) => RESOURCE_ORDER.filter((r) => c[r]).map((r) => resCount(c[r]!, r)).join(', ')
/** "+2 wood +1 ore". */
export const resGains = (c: Partial<Record<Resource, number>>) => RESOURCE_ORDER.filter((r) => c[r]).map((r) => `+${resCount(c[r]!, r)}`).join(' ')

/** Card names as titles. */
export const cardName = (c: DevCardType) => ({
  knight: L('Knight', 'Рыцарь'), roadBuilding: L('Road Building', 'Строительство дорог'), yearOfPlenty: L('Year of Plenty', 'Год изобилия'),
  monopoly: L('Monopoly', 'Монополия'), victoryPoint: L('Victory Point', 'Победное очко'),
})[c]

export const awardName = (a: 'longestRoad' | 'largestArmy') => (a === 'longestRoad' ? L('Longest Road', 'Самая длинная дорога') : L('Largest Army', 'Самое большое войско'))

export type PieceKind = 'road' | 'settlement' | 'city' | 'dev'
export const pieceName = (k: PieceKind) => ({ road: L('Road', 'Дорога'), settlement: L('Settlement', 'Поселение'), city: L('City', 'Город'), dev: L('Buy development card', 'Купить карту развития') })[k]

const TERRAIN: Record<Terrain, [string, string]> = {
  forest: ['forest', 'лес'], pasture: ['pasture', 'пастбище'], fields: ['fields', 'поле'], hills: ['hills', 'холмы'], mountains: ['mountains', 'горы'], desert: ['desert', 'пустыня'],
}
export const terrainName = (t: Terrain) => L(...TERRAIN[t])

/** Seat colours: the default player names. */
export const colourName = (p: PlayerId) => ({ p1: L('Red', 'Красный'), p2: L('Blue', 'Синий'), p3: L('White', 'Белый'), p4: L('Orange', 'Оранжевый') })[p]

/** "1 wool, 1 grain, 1 ore": a cost in the current language. */
export const costText0 = resList
