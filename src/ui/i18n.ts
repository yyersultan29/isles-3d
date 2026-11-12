// Player-facing messages for engine error codes (GAME_DESIGN.md §19, ROADMAP G4.5). The engine's
// own messages are developer text; the HUD shows these instead. A Record over ErrorCode makes a
// missing code a type error. One locale for now; another is a second table of the same type.

import type { ErrorCode } from '../game'

export type Messages = Record<ErrorCode, string>

export const EN: Messages = {
  INVALID_SETTINGS: 'These game settings are not valid.',
  GAME_OVER: 'The game is over.',
  NOT_YOUR_TURN: 'It isn’t your turn.',
  WRONG_PHASE: 'You can’t do that right now.',
  UNKNOWN_LOCATION: 'That spot isn’t on the board.',
  OCCUPIED: 'That spot is already taken.',
  DISTANCE_RULE: 'Too close to another settlement: leave one corner free between them.',
  NOT_CONNECTED: 'It has to connect to one of your roads or buildings.',
  BLOCKED_BY_OPPONENT: 'An opponent’s building blocks that road.',
  NOT_YOUR_SETTLEMENT: 'Only your own settlement can become a city.',
  NO_PIECES_LEFT: 'You have no pieces of that kind left.',
  INSUFFICIENT_RESOURCES: 'You don’t have enough resources for that.',
  BANK_EMPTY: 'The bank has run out of that resource.',
  DECK_EMPTY: 'There are no development cards left.',
  CARD_NOT_HELD: 'You don’t have that card.',
  CARD_BOUGHT_THIS_TURN: 'A card can’t be played on the turn you bought it.',
  DEV_ALREADY_PLAYED: 'Only one development card per turn.',
  CARD_NOT_PLAYABLE: 'That card can’t be played right now.',
  INVALID_DISCARD: 'Choose exactly the number of cards to discard.',
  ROBBER_SAME_TILE: 'Move the robber to a different tile.',
  ROBBER_PROTECTED: 'The friendly robber protects that tile.',
  INVALID_VICTIM: 'You can’t rob that player.',
  INVALID_TRADE: 'That trade isn’t valid: both sides need cards, and different ones.',
  NO_OPEN_TRADE: 'That offer is no longer open.',
  NOT_ADDRESSED: 'That offer wasn’t made to this player.',
  TRADE_NOT_ACCEPTED: 'That player hasn’t accepted the offer.',
  TRADE_STALE: 'Someone no longer has the cards for this trade.',
  TRADE_LIMIT: 'You’ve made too many offers this turn.',
  MALFORMED_ACTION: 'Something went wrong with that action.',
}

export const errorText = (code: ErrorCode, m: Messages = EN) => m[code]
