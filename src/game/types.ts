// Isles 3D game engine: domain types (GAME_DESIGN.md §11).
// Pure TypeScript. Nothing in src/game may import react, three, @react-three/*, src/scene or src/ui.

import type { ErrorCode } from './errors'

export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore'
/** Canonical resource order, used wherever order matters (§3.1). */
export const RESOURCE_ORDER: readonly Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore']
export type Terrain = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert'
export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4'
export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2', 'p3', 'p4']

/** Axial hex `q,r` (§2.2). */
export type TileId = `${number},${number}`
/** Canonical vertex: the N or S corner of exactly one hex (§2.3). */
export type VertexId = `${number},${number},${'N' | 'S'}`
/** Canonical edge: the NE, NW or W side of exactly one hex (§2.3). */
export type EdgeId = `${number},${number},${'NE' | 'NW' | 'W'}`

export type ResourceCounts = Record<Resource, number>
export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'

export interface Tile { id: TileId; q: number; r: number; terrain: Terrain; token: number | null }
export type PortKind = Resource | 'generic'
export interface Port { edge: EdgeId; vertices: [VertexId, VertexId]; kind: PortKind }

/** Adjacency maps built once from the land hexes (§2.3). Plain JSON, no Map/Set. */
export interface Topology {
  tiles: TileId[] // canonical order: by r, then q
  vertices: VertexId[] // sorted
  edges: EdgeId[] // sorted
  /** six corners, indexed like the scene's corner(k): k=5 N, 0 NE, 1 SE, 2 S, 3 SW, 4 NW */
  tileVertices: Record<TileId, VertexId[]>
  /** six sides, indexed like the scene's edge k (between corner k and k+1): 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE */
  tileEdges: Record<TileId, EdgeId[]>
  vertexTiles: Record<VertexId, TileId[]>
  vertexEdges: Record<VertexId, EdgeId[]>
  vertexNeighbors: Record<VertexId, VertexId[]>
  edgeVertices: Record<EdgeId, [VertexId, VertexId]>
  edgeTiles: Record<EdgeId, TileId[]>
}

export interface Board {
  tiles: Record<TileId, Tile>
  ports: Port[]
  topo: Topology
}

export interface Building { owner: PlayerId; type: 'settlement' | 'city' }
export interface DevCard { id: number; type: DevCardType; boughtOnTurn: number }

export interface PlayerState {
  id: PlayerId
  resources: ResourceCounts
  devCards: DevCard[]
  playedKnights: number
  playedDevThisTurn: boolean
  /** pieces remaining in supply */
  pieces: { roads: number; settlements: number; cities: number }
}

export interface PendingTrade {
  id: number
  from: PlayerId
  offer: Partial<ResourceCounts>
  request: Partial<ResourceCounts>
  to: PlayerId[]
  responses: Partial<Record<PlayerId, 'accept' | 'reject'>>
}

export type BoardPreset = 'standard-fixed' | 'random'

export interface GameSettings {
  /** default 10 */
  vpToWin: number
  /** players holding MORE than this many resource cards discard on a 7; default 7 */
  discardLimit: number
  /** default false */
  friendlyRobber: boolean
  boardPreset: BoardPreset
  /** uint32 */
  seed: number
}

export type Resume = 'preRoll' | 'actions'
export type Phase =
  | { kind: 'setup'; round: 1 | 2; step: 'settlement' | 'road'; lastSettlement?: VertexId }
  | { kind: 'preRoll' }
  | { kind: 'discard'; pending: Partial<Record<PlayerId, number>> }
  | { kind: 'moveRobber'; source: 'seven' | 'knight'; resume: Resume }
  | { kind: 'steal'; tile: TileId; candidates: PlayerId[]; resume: Resume }
  | { kind: 'actions' }
  | { kind: 'roadBuilding'; remaining: 1 | 2; resume: Resume }
  | { kind: 'gameOver'; winner: PlayerId }

export interface GameState {
  schemaVersion: 1
  settings: GameSettings
  board: Board
  /** SECRET: never leaves the engine/server (§17) */
  rngState: number
  players: PlayerState[]
  order: PlayerId[]
  /** index into `order` */
  active: number
  /** 0 during setup, 1 at the first preRoll, +1 on every END_TURN */
  turn: number
  phase: Phase
  dice: [number, number] | null
  buildings: Partial<Record<VertexId, Building>>
  roads: Partial<Record<EdgeId, PlayerId>>
  robber: TileId
  bank: ResourceCounts
  /** SECRET: order and contents */
  deck: DevCard[]
  longestRoad: PlayerId | null
  largestArmy: PlayerId | null
  trade: PendingTrade | null
  tradesProposedThisTurn: number
  /** increments on every successful apply; sequence number */
  actionCount: number
}

/** The actor is always the `player` argument of validate/apply, never a field of the action. */
export type Action =
  | { type: 'PLACE_SETTLEMENT'; vertex: VertexId }
  | { type: 'PLACE_ROAD'; edge: EdgeId }
  | { type: 'ROLL' }
  | { type: 'DISCARD'; cards: Partial<ResourceCounts> }
  | { type: 'MOVE_ROBBER'; tile: TileId }
  | { type: 'STEAL'; victim: PlayerId }
  | { type: 'BUILD_ROAD'; edge: EdgeId }
  | { type: 'BUILD_SETTLEMENT'; vertex: VertexId }
  | { type: 'BUILD_CITY'; vertex: VertexId }
  | { type: 'BUY_DEV' }
  | { type: 'PLAY_KNIGHT' }
  | { type: 'PLAY_ROAD_BUILDING' }
  | { type: 'PLAY_YEAR_OF_PLENTY'; take: Resource[] }
  | { type: 'PLAY_MONOPOLY'; resource: Resource }
  | { type: 'BANK_TRADE'; give: Resource; get: Resource; count?: number }
  | { type: 'PROPOSE_TRADE'; offer: Partial<ResourceCounts>; request: Partial<ResourceCounts>; to?: PlayerId[] }
  | { type: 'RESPOND_TRADE'; tradeId: number; accept: boolean }
  | { type: 'CONFIRM_TRADE'; tradeId: number; with: PlayerId }
  | { type: 'CANCEL_TRADE' }
  | { type: 'END_TURN' }

export type ActionType = Action['type']

/** Concrete actions, or markers for open-ended types (§11). */
export type LegalAction = Action | { type: 'DISCARD'; count: number } | { type: 'PROPOSE_TRADE' }

export type GameEvent =
  | { type: 'GAME_STARTED'; order: PlayerId[] }
  | { type: 'SETUP_PLACED'; what: 'settlement' | 'road'; at: string; by: PlayerId }
  | { type: 'SETUP_RESOURCES'; player: PlayerId; gains: Partial<ResourceCounts> }
  | { type: 'TURN_STARTED'; player: PlayerId; turn: number }
  | { type: 'DICE_ROLLED'; by: PlayerId; dice: [number, number] }
  | { type: 'RESOURCES_PRODUCED'; gains: Partial<Record<PlayerId, Partial<ResourceCounts>>>; shortfall: Resource[] }
  | { type: 'DISCARD_REQUIRED'; pending: Partial<Record<PlayerId, number>> }
  | { type: 'DISCARDED'; player: PlayerId; cards: Partial<ResourceCounts> }
  | { type: 'ROBBER_MOVED'; by: PlayerId; from: TileId; to: TileId }
  | { type: 'CARD_STOLEN'; from: PlayerId; to: PlayerId; resource: Resource | null }
  | { type: 'BUILT'; what: 'road' | 'settlement' | 'city'; at: string; by: PlayerId; free: boolean }
  | { type: 'DEV_BOUGHT'; by: PlayerId; card: DevCardType | null }
  | { type: 'DEV_PLAYED'; by: PlayerId; card: Exclude<DevCardType, 'victoryPoint'> }
  | { type: 'YEAR_OF_PLENTY_TAKEN'; by: PlayerId; cards: Partial<ResourceCounts> }
  | { type: 'MONOPOLY_RESOLVED'; by: PlayerId; resource: Resource; taken: Partial<Record<PlayerId, number>> }
  | { type: 'BANK_TRADED'; by: PlayerId; gave: Partial<ResourceCounts>; got: Partial<ResourceCounts> }
  | { type: 'TRADE_PROPOSED'; trade: PendingTrade }
  | { type: 'TRADE_RESPONDED'; tradeId: number; player: PlayerId; accept: boolean }
  | { type: 'TRADE_COMPLETED'; tradeId: number; from: PlayerId; with: PlayerId; gave: Partial<ResourceCounts>; got: Partial<ResourceCounts> }
  | { type: 'TRADE_CANCELLED'; tradeId: number; reason: 'cancelled' | 'replaced' | 'handChanged' | 'turnEnded' }
  | { type: 'AWARD_CHANGED'; award: 'longestRoad' | 'largestArmy'; from: PlayerId | null; to: PlayerId | null }
  | { type: 'TURN_ENDED'; player: PlayerId }
  | { type: 'GAME_WON'; by: PlayerId; totals: Record<PlayerId, number>; vpCards: Record<PlayerId, number> }

export interface EngineError { code: ErrorCode; message: string }

export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError }

export type Check = { ok: true } | { ok: false; error: EngineError }
