// Player-facing messages for engine error codes (GAME_DESIGN.md §19, ROADMAP G4.5). The engine's
// own messages are developer text; the HUD shows these instead. A Record over ErrorCode makes a
// missing code a type error. G9.4: a Russian table of the same type; the type makes a missing code an error in both.

import type { ErrorCode } from '../game'
import { getLocale } from './locale'

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

export const RU: Messages = {
  INVALID_SETTINGS: 'Недопустимые настройки игры.',
  GAME_OVER: 'Игра окончена.',
  NOT_YOUR_TURN: 'Сейчас не ваш ход.',
  WRONG_PHASE: 'Сейчас это сделать нельзя.',
  UNKNOWN_LOCATION: 'Такого места нет на поле.',
  OCCUPIED: 'Это место уже занято.',
  DISTANCE_RULE: 'Слишком близко к другому поселению: между ними должен быть свободный угол.',
  NOT_CONNECTED: 'Нужно соединение с вашей дорогой или постройкой.',
  BLOCKED_BY_OPPONENT: 'Постройка соперника перекрывает эту дорогу.',
  NOT_YOUR_SETTLEMENT: 'Городом можно сделать только своё поселение.',
  NO_PIECES_LEFT: 'Фишки этого вида закончились.',
  INSUFFICIENT_RESOURCES: 'Не хватает ресурсов.',
  BANK_EMPTY: 'В банке закончился этот ресурс.',
  DECK_EMPTY: 'Карты развития закончились.',
  CARD_NOT_HELD: 'У вас нет этой карты.',
  CARD_BOUGHT_THIS_TURN: 'Карту нельзя сыграть в ход покупки.',
  DEV_ALREADY_PLAYED: 'За ход можно сыграть только одну карту развития.',
  CARD_NOT_PLAYABLE: 'Эту карту сейчас сыграть нельзя.',
  INVALID_DISCARD: 'Выберите ровно столько карт, сколько нужно сбросить.',
  ROBBER_SAME_TILE: 'Переставьте разбойника на другой гекс.',
  ROBBER_PROTECTED: 'Этот гекс защищён добрым разбойником.',
  INVALID_VICTIM: 'Этого игрока ограбить нельзя.',
  INVALID_TRADE: 'Неверный обмен: с обеих сторон нужны карты, и разные.',
  NO_OPEN_TRADE: 'Это предложение уже закрыто.',
  NOT_ADDRESSED: 'Это предложение было не для этого игрока.',
  TRADE_NOT_ACCEPTED: 'Игрок не принял предложение.',
  TRADE_STALE: 'У кого-то уже нет карт для этого обмена.',
  TRADE_LIMIT: 'В этот ход сделано слишком много предложений.',
  MALFORMED_ACTION: 'С этим действием что-то пошло не так.',
}

/** The message for an engine error code, in the current language (or the given table). */
export const errorText = (code: ErrorCode, m?: Messages) => (m ?? (getLocale() === 'ru' ? RU : EN))[code]
