// Abuse limits for the game server (ROADMAP G5.6, GAME_DESIGN §21 "per-connection rate limit").
// Pure: token buckets on an injected clock, and the default limits. The server decides what to do
// when a bucket is empty (drop a frame, refuse a room, close a socket).

/** A token bucket: `burst` tokens, refilled at `perSecond`. take() spends one if there is one. */
export class Bucket {
  private tokens: number
  private at: number
  constructor(private readonly burst: number, private readonly perSecond: number, private readonly now: () => number) {
    this.tokens = burst
    this.at = now()
  }
  take(): boolean {
    const t = this.now()
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.at) / 1000) * this.perSecond)
    this.at = t
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
  /** true once the bucket has refilled completely (an idle key can be forgotten) */
  full(): boolean {
    return Math.min(this.burst, this.tokens + ((this.now() - this.at) / 1000) * this.perSecond) >= this.burst
  }
}

/** Buckets by key (an address), forgotten once they refill so the map can't grow without bound. */
export class Buckets {
  private readonly map = new Map<string, Bucket>()
  constructor(private readonly burst: number, private readonly perSecond: number, private readonly now: () => number) {}
  take(key: string): boolean {
    let b = this.map.get(key)
    if (!b) { b = new Bucket(this.burst, this.perSecond, this.now); this.map.set(key, b) }
    return b.take()
  }
  sweep() { for (const [k, b] of this.map) if (b.full()) this.map.delete(k) }
  get size() { return this.map.size }
}

export interface Limits {
  /** frames per connection: burst and refill per second. A person sends a few per second at most. */
  msgBurst: number
  msgPerSecond: number
  /** dropped frames tolerated (burst, refill per second) before the socket is closed with 1008 */
  dropBurst: number
  dropPerSecond: number
  /** POST /rooms per address: burst and refill per minute; then 429 */
  roomBurst: number
  roomsPerMinute: number
  /** rooms in memory; then 503 */
  maxRooms: number
  /** WebSocket handshakes per address: burst and refill per minute; then refused */
  connectBurst: number
  connectsPerMinute: number
  /** open sockets per address and in total */
  socketsPerAddress: number
  maxSockets: number
  /** connections in one room (4 seats and spectators); then ROOM_FULL */
  connsPerRoom: number
  /** a socket that hasn't joined a room by then is closed */
  joinTimeoutMs: number
  /** a room with no connection for this long is removed (lobby, finished game, or anything left) */
  emptyRoomMs: number
}

export const DEFAULT_LIMITS: Limits = {
  msgBurst: 40,
  msgPerSecond: 10,
  dropBurst: 40,
  dropPerSecond: 2,
  roomBurst: 10,
  roomsPerMinute: 10,
  maxRooms: 500,
  connectBurst: 60,
  connectsPerMinute: 60,
  socketsPerAddress: 32,
  maxSockets: 2000,
  connsPerRoom: 24,
  joinTimeoutMs: 10_000,
  emptyRoomMs: 10 * 60_000,
}
