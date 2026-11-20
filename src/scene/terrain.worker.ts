// Builds every tile's surface mesh off the main thread (the largest share of the load freeze).
// The main thread sends its current tiles and ledges, the only board state tileHeight reads.
import { TILES, LEDGES, type Tile } from './board'
import { buildTileGeometry, tileDetail } from './terrainGeometry'

export interface TileArrays { position: Float32Array; normal: Float32Array; color: Float32Array; index: Uint16Array | Uint32Array }

self.onmessage = (e: MessageEvent<{ tiles: Tile[]; ledges: typeof LEDGES }>) => {
  TILES.splice(0, TILES.length, ...e.data.tiles)
  LEDGES.splice(0, LEDGES.length, ...e.data.ledges)
  const out: TileArrays[] = TILES.map((t) => {
    const g = buildTileGeometry(t, tileDetail(t))
    const a = (n: string) => g.getAttribute(n).array as Float32Array
    return { position: a('position'), normal: a('normal'), color: a('color'), index: g.index!.array as Uint16Array | Uint32Array }
  })
  postMessage(out, { transfer: out.flatMap((o) => [o.position.buffer, o.normal.buffer, o.color.buffer, o.index.buffer]) })
}
