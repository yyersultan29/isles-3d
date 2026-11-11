// Closed catalog of engine error codes (GAME_DESIGN.md §19). Messages are developer text; the UI
// shows its own i18n string per code. Tests assert codes, never message text.

export type ErrorCode =
  | 'INVALID_SETTINGS'
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'UNKNOWN_LOCATION'
  | 'OCCUPIED'
  | 'DISTANCE_RULE'
  | 'NOT_CONNECTED'
  | 'BLOCKED_BY_OPPONENT'
  | 'NOT_YOUR_SETTLEMENT'
  | 'NO_PIECES_LEFT'
  | 'INSUFFICIENT_RESOURCES'
  | 'BANK_EMPTY'
  | 'DECK_EMPTY'
  | 'CARD_NOT_HELD'
  | 'CARD_BOUGHT_THIS_TURN'
  | 'DEV_ALREADY_PLAYED'
  | 'CARD_NOT_PLAYABLE'
  | 'INVALID_DISCARD'
  | 'ROBBER_SAME_TILE'
  | 'ROBBER_PROTECTED'
  | 'INVALID_VICTIM'
  | 'INVALID_TRADE'
  | 'NO_OPEN_TRADE'
  | 'NOT_ADDRESSED'
  | 'TRADE_NOT_ACCEPTED'
  | 'TRADE_STALE'
  | 'TRADE_LIMIT'
  | 'MALFORMED_ACTION'

/** Thrown inside the engine's draft step only; `apply` converts it to `{ ok: false }`. */
export class RuleError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message)
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new RuleError(code, message)
}
