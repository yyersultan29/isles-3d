// Visibility (GAME_DESIGN.md §17). viewFor/eventsFor are the only way state reaches a screen or a
// socket: they never expose rngState, the deck, other players' hands or dev-card types, and the
// seed only once the game is over.

import type { DevCard, GameEvent, GameSettings, GameState, PlayerId, ResourceCounts } from './types'
import { handSize, publicVP, totalVP } from './state'

export type Viewer = PlayerId | 'spectator'

export interface PublicPlayer {
  id: PlayerId
  resourceCount: number
  devCardCount: number
  playedKnights: number
  pieces: { roads: number; settlements: number; cities: number }
  publicVP: number
  /** own player only */
  resources?: ResourceCounts
  /** own player only */
  devCards?: DevCard[]
  /** own player only (others see it at GAME_WON) */
  totalVP?: number
}

export type PublicGameState = Omit<GameState, 'rngState' | 'deck' | 'players' | 'settings'> & {
  settings: Omit<GameSettings, 'seed'> & { seed?: number }
  deckCount: number
  players: PublicPlayer[]
  viewer: Viewer
}

export function viewFor(s: GameState, viewer: Viewer): PublicGameState {
  // explicit field list: a new secret field in GameState stays hidden until it is added here
  const { seed, ...rest } = s.settings
  return {
    schemaVersion: s.schemaVersion,
    settings: s.phase.kind === 'gameOver' ? { ...rest, seed } : rest,
    board: s.board,
    order: [...s.order],
    active: s.active,
    turn: s.turn,
    phase: structuredClone(s.phase),
    dice: s.dice ? [s.dice[0], s.dice[1]] : null,
    buildings: structuredClone(s.buildings),
    roads: { ...s.roads },
    robber: s.robber,
    bank: { ...s.bank },
    deckCount: s.deck.length,
    longestRoad: s.longestRoad,
    largestArmy: s.largestArmy,
    trade: s.trade ? structuredClone(s.trade) : null,
    tradesProposedThisTurn: s.tradesProposedThisTurn,
    actionCount: s.actionCount,
    viewer,
    players: s.players.map((p) => {
      const pub: PublicPlayer = {
        id: p.id,
        resourceCount: handSize(p.resources),
        devCardCount: p.devCards.length,
        playedKnights: p.playedKnights,
        pieces: { ...p.pieces },
        publicVP: publicVP(s, p.id),
      }
      if (p.id === viewer) {
        pub.resources = { ...p.resources }
        pub.devCards = p.devCards.map((c) => ({ ...c }))
        pub.totalVP = totalVP(s, p.id)
      }
      return pub
    }),
  }
}

export function eventsFor(events: readonly GameEvent[], viewer: Viewer): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'CARD_STOLEN' && viewer !== e.from && viewer !== e.to) return { ...e, resource: null }
    if (e.type === 'DEV_BOUGHT' && viewer !== e.by) return { ...e, card: null }
    return e
  })
}
