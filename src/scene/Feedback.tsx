// Event-driven scene feedback (ROADMAP G4.5c). Animations start from GameEvents after the state is
// already final, so they never delay the game:
//  - a new road, settlement or city drops into place (Buildings leaves it out of the static batch
//    meanwhile, see arrivals.ts); instant under reduced motion;
//  - after a roll, a "+N" tag with the resource icon rises from each producing tile.

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { edgeToScene, tileByAxial, vertexToScene } from './board'
import { BuildingPiece, Roads, usePieces } from './Pieces'
import { DROP_MS, arrivalStart, arrive, buildingKey, roadKey, useArrivals } from './arrivals'
import { productionTags, type ProductionTag } from './production'
import { motion } from './motion'
import { useGameEvents } from '../store/GameProvider'
import { Brick, Logs, Ore, SheepIcon, WheatIcon } from '../ui/icons'
import type { EdgeId, Resource, VertexId } from '../game'

const DROP_H = 0.7
const TAG_MS = 1800
const ICON: Record<Resource, (p: { className?: string }) => React.ReactElement> = { lumber: Logs, brick: Brick, wool: SheepIcon, grain: WheatIcon, ore: Ore }

const bounceOut = (k: number) => {
  const n = 7.5625, d = 2.75
  if (k < 1 / d) return n * k * k
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375
  return n * (k -= 2.625 / d) * k + 0.984375
}

function Drop({ k, children }: { k: string; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = Math.min(1, (performance.now() - arrivalStart(k)) / DROP_MS)
    g.position.y = (1 - bounceOut(t)) * DROP_H
  })
  return <group ref={ref} position-y={DROP_H}>{children}</group>
}

function Arrivals() {
  const arriving = useArrivals()
  const pieces = usePieces()
  if (!arriving.size) return null
  return (
    <>
      {pieces.buildings.filter((b) => arriving.has(buildingKey(b))).map((b) => <Drop key={buildingKey(b)} k={buildingKey(b)}><BuildingPiece b={b} /></Drop>)}
      {pieces.roads.filter((r) => arriving.has(roadKey(r))).map((r) => <Drop key={roadKey(r)} k={roadKey(r)}><Roads roads={[r]} /></Drop>)}
    </>
  )
}

function Tag({ tag }: { tag: ProductionTag }) {
  const t = tileByAxial(tag.tile)
  if (!t) return null
  const I = ICON[tag.res]
  return (
    <Html position={[t.x, 0.62, t.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div aria-hidden className="flex items-center gap-[3px] whitespace-nowrap rounded-full bg-[#1d1a16]/85 py-[2px] pl-[3px] pr-[9px] font-display text-[17px] font-semibold text-white shadow-[0_3px_10px_rgba(0,0,0,.45)] ring-1 ring-[#f2cf84]/60 [animation:tag-rise_1.9s_ease-out]">
        <I className="h-[24px] w-[28px]" />+{tag.n}
      </div>
    </Html>
  )
}

export function Feedback() {
  const [tags, setTags] = useState<{ id: number; list: ProductionTag[] } | null>(null)
  const nextId = useRef(1)
  useGameEvents((events, s) => {
    let roll = 0
    for (const e of events) {
      if (!motion.reduced && (e.type === 'BUILT' || e.type === 'SETUP_PLACED')) {
        arrive(e.what === 'road' ? roadKey(edgeToScene(e.at as EdgeId)) : buildingKey(vertexToScene(e.at as VertexId)))
      }
      if (e.type === 'DICE_ROLLED') roll = e.dice[0] + e.dice[1]
      if (e.type === 'RESOURCES_PRODUCED' && roll) {
        const list = productionTags(s, roll, e.shortfall)
        if (list.length) {
          const id = nextId.current++
          setTags({ id, list })
          setTimeout(() => setTags((cur) => (cur?.id === id ? null : cur)), TAG_MS)
        }
      }
    }
  })
  return (
    <>
      <Arrivals />
      {tags?.list.map((t) => <Tag key={`${tags.id}:${t.tile}`} tag={t} />)}
    </>
  )
}
