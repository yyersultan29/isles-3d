// Public surface of the pure game engine.
export * from './types'
export type { ErrorCode } from './errors'
export { createGame, apply, validate, legalActions, DEFAULT_SETTINGS } from './engine'
export { viewFor, eventsFor, type PublicGameState, type PublicPlayer, type Viewer } from './view'
export { buildTopology, sceneToAxial, axialToScene, hexCorners, hexSides } from './topology'
export { STANDARD_FIXED, PORT_EDGES, pips, resourceOf } from './board'
