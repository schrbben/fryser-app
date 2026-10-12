'use client'

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import CameraControlsImpl from 'camera-controls'
import { COLORS, LEVELS_TOP_DOWN, SHELVES, SLOTS, boxInSlot, slotSpan, type ShelfId, type Slot, type StorageBox, type StorageItem } from '@/lib/storage'

CameraControlsImpl.install({ THREE })
const { ACTION } = CameraControlsImpl

export type Preset = 'overview' | 'A' | 'B'
export type Insets = { bottom: number; right: number }

// Alle mål i meter. x går langs kortveggen, z langs langveggen, døra står på z = ROOM.length.
const ROOM = { width: 2, length: 3, height: 2.3 }
// Biltema oppbevaringshylle 1000 kg: 160 × 60 × 180 cm med fire hylleplater
const SHELF = { width: 1.6, depth: 0.6, height: 1.8, post: 0.035, board: 0.018, boards: [0.12, 0.67, 1.22, 1.77] }
const SLOT_PITCH = 0.385
const DOOR = { center: 0.95, width: 0.82, height: 2 }
const SHELF_PULL = { clear: 0.02, present: 0.1, lift: 0.05 }
const FLOOR_LIFT = 0.03
const UP = new THREE.Vector3(0, 1, 0)

// Hver hylle har sitt eget koordinatsystem: origo bak på midten ved gulvet, +z peker ut i rommet.
const SHELF_LAYOUT: Record<ShelfId, { position: THREE.Vector3; rotationY: number }> = {
  // Kortveggen innerst, inntil venstre hjørne
  A: { position: new THREE.Vector3(0.02 + SHELF.width / 2, 0, 0.02), rotationY: 0 },
  // Høyre langvegg, helt inn mot døra, så boksene lengst til høyre i hylle A kan trekkes rett ut
  B: { position: new THREE.Vector3(ROOM.width - 0.02, 0, ROOM.length - 0.02 - SHELF.width / 2), rotationY: -Math.PI / 2 },
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const deg = (degrees: number) => (degrees * Math.PI) / 180
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const noRaycast = () => null

function toWorld(shelf: ShelfId, local: THREE.Vector3) {
  const layout = SHELF_LAYOUT[shelf]
  return local.clone().applyAxisAngle(UP, layout.rotationY).add(layout.position)
}

function shelfNormal(shelf: ShelfId) {
  return v3(0, 0, 1).applyAxisAngle(UP, SHELF_LAYOUT[shelf].rotationY)
}

// ---------- Størrelser ----------

type Spec = { width: number; depth: number; height: number; lid: number }

// SmartStore Classic 45 / Dry 45: ca. 59 × 39 × 31 cm, står med langsiden innover i hylla
const BOX_SPEC: Spec = { width: 0.375, depth: 0.59, height: 0.31, lid: 0.025 }

function specFor(box: StorageBox): Spec {
  switch (box.kind) {
    case 'box':
    case 'bin':
      return BOX_SPEC
    case 'suitcase':
      return { width: 0.7, depth: 0.47, height: 0.13, lid: 0.13 }
    case 'cardboard':
      return { width: 0.35, depth: 0.5, height: 0.35, lid: 0.005 }
    case 'loose':
      return box.placement === 'shelf' ? { width: 0.36, depth: 0.55, height: 0.012, lid: 0 } : { width: 0.6, depth: 0.45, height: 0.012, lid: 0 }
  }
}

const visualHeight = (box: StorageBox, spec: Spec) => (box.kind === 'loose' ? 0.4 : spec.height + spec.lid)

// Midt på plassen(e) den står på. En koffert står midt over to plasser.
function shelfRest(slot: Pick<StorageBox, 'slot' | 'level'>, spec: Spec, span = 1) {
  return v3(((slot.slot ?? 1) - 2.5 + (span - 1) / 2) * SLOT_PITCH, SHELF.boards[(slot.level ?? 1) - 1], 0.01 + spec.depth / 2)
}

// Hvor langt ut av hylla boksen trekkes (relativt til der den står)
function shelfOut(spec: Spec, rest: THREE.Vector3, gap: number) {
  return SHELF.depth + spec.depth / 2 + gap - rest.z
}

// Der en åpnet boks havner, og hvilken vei forsiden peker (brukes av kameraet)
function openAnchor(box: StorageBox) {
  const spec = specFor(box)
  const height = visualHeight(box, spec)
  if (box.placement === 'shelf' && box.shelf) {
    const rest = shelfRest(box, spec, slotSpan(box.kind))
    const local = rest.clone().add(v3(0, SHELF_PULL.lift + height / 2, shelfOut(spec, rest, SHELF_PULL.present)))
    return { center: toWorld(box.shelf, local), front: shelfNormal(box.shelf), onShelf: true }
  }
  const rotation = deg(box.rotation)
  return {
    center: v3(box.pos_x ?? ROOM.width / 2, FLOOR_LIFT + height / 2, box.pos_z ?? ROOM.length / 2),
    front: v3(Math.sin(rotation), 0, Math.cos(rotation)),
    onShelf: false,
  }
}

// ---------- Materialer og geometri ----------

const GEO = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
}

const MAT = {
  clearBody: new THREE.MeshStandardMaterial({ color: '#d3dfeb', transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide }),
  clearLid: new THREE.MeshStandardMaterial({ color: '#eef3f8', transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false }),
  clip: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 }),
  blackBody: new THREE.MeshStandardMaterial({ color: '#4a525d', transparent: true, opacity: 0.8, roughness: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  blackLid: new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.5 }),
  whiteBody: new THREE.MeshStandardMaterial({ color: '#ecece8', roughness: 0.45 }),
  whiteLid: new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.4 }),
  cardboard: new THREE.MeshStandardMaterial({ color: '#b58a55', roughness: 0.95 }),
  tape: new THREE.MeshStandardMaterial({ color: '#d9c49b', roughness: 0.4 }),
  seam: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }),
  mat: new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.9 }),
  ghost: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }),
  frame: new THREE.MeshStandardMaterial({ color: '#3d4046', roughness: 0.5, metalness: 0.45 }),
  board: new THREE.MeshStandardMaterial({ color: '#c9a77c', roughness: 0.85 }),
  floor: new THREE.MeshStandardMaterial({ color: '#9b948d', roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ color: '#ebe7e1', roughness: 0.95 }),
  sideWall: new THREE.MeshStandardMaterial({ color: '#dfdad3', roughness: 0.95 }),
  door: new THREE.MeshStandardMaterial({ color: '#8f7254', roughness: 0.7 }),
}

const CONTENT_MATS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#64748b'].map(
  color => new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
)

const materialCache = new Map<string, THREE.MeshStandardMaterial>()
function colored(key: string, hex: string, roughness: number) {
  let material = materialCache.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: hex, roughness })
    materialCache.set(key, material)
  }
  return material
}

const colorHex = (color: string) => COLORS[color]?.hex ?? COLORS.gray.hex
const shade = (hex: string, factor: number) => '#' + new THREE.Color(hex).multiplyScalar(factor).getHexString()

// ---------- Etiketter tegnet på canvas ----------

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Skriver teksten så stort som mulig innenfor bredden, og kutter med … hvis den fortsatt er for lang
function fittedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxSize: number, minSize: number) {
  let size = maxSize
  ctx.font = `800 ${size}px ${FONT}`
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  let cut = text
  while (cut.length > 1 && ctx.measureText(cut).width > maxWidth) cut = cut.slice(0, -2) + '…'
  ctx.fillText(cut, x, y)
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function sticker(ctx: CanvasRenderingContext2D, w: number, h: number, highlighted: boolean) {
  roundedRect(ctx, 10, 10, w - 20, h - 20, 36)
  ctx.fillStyle = highlighted ? '#fbbf24' : '#ffffff'
  ctx.fill()
  ctx.lineWidth = 12
  ctx.strokeStyle = '#1c1917'
  ctx.stroke()
  ctx.fillStyle = '#1c1917'
}

function numberLabel(number: number, label: string, highlighted: boolean) {
  return canvasTexture(512, 360, ctx => {
    sticker(ctx, 512, 360, highlighted)
    ctx.font = `800 ${label ? 200 : 250}px ${FONT}`
    ctx.fillText(String(number), 256, label ? 150 : 195)
    if (label) fittedText(ctx, label, 256, 295, 440, 60, 36)
  })
}

function nameLabel(text: string, highlighted: boolean) {
  return canvasTexture(512, 256, ctx => {
    sticker(ctx, 512, 256, highlighted)
    fittedText(ctx, text, 256, 136, 440, 110, 44)
  })
}

function lidLabel(number: number, highlighted: boolean) {
  return canvasTexture(256, 256, ctx => {
    ctx.beginPath()
    ctx.arc(128, 128, 118, 0, Math.PI * 2)
    ctx.fillStyle = highlighted ? '#fbbf24' : '#ffffff'
    ctx.fill()
    ctx.lineWidth = 10
    ctx.strokeStyle = '#1c1917'
    ctx.stroke()
    ctx.fillStyle = '#1c1917'
    ctx.font = `800 ${number >= 10 ? 125 : 160}px ${FONT}`
    ctx.fillText(String(number), 128, 140)
  })
}

function signLabel(text: string) {
  return canvasTexture(512, 128, ctx => {
    roundedRect(ctx, 4, 4, 504, 120, 24)
    ctx.fillStyle = '#1c1917'
    ctx.fill()
    ctx.fillStyle = '#fbbf24'
    fittedText(ctx, text, 256, 68, 470, 76, 36)
  })
}

function plusLabel() {
  return canvasTexture(256, 256, ctx => {
    ctx.setLineDash([22, 14])
    ctx.lineWidth = 10
    ctx.strokeStyle = '#fbbf24'
    roundedRect(ctx, 12, 12, 232, 232, 40)
    ctx.stroke()
    ctx.fillStyle = '#fbbf24'
    ctx.font = `700 170px ${FONT}`
    ctx.fillText('+', 128, 140)
  })
}

function useTexture(factory: () => THREE.Texture, deps: unknown[]) {
  const texture = useMemo(factory, deps)
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

// ---------- Rommet og hyllene ----------

function Room({ onFloorClick }: { onFloorClick: (point: { x: number; z: number }) => void }) {
  const { width: W, length: L, height: H } = ROOM

  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 6) onFloorClick({ x: e.point.x, z: e.point.z })
  }

  // Veggene er enkeltsidige plan som vender inn i rommet. Sett utenfra blir de usynlige,
  // så man kan se inn i boden som i et dukkehus.
  return (
    <group>
      <mesh geometry={GEO.plane} material={MAT.floor} rotation-x={-Math.PI / 2} position={[W / 2, 0, L / 2]} scale={[W, L, 1]} onClick={handleFloorClick} />
      <mesh geometry={GEO.plane} material={MAT.wall} position={[W / 2, H / 2, 0]} scale={[W, H, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={MAT.wall} rotation-y={Math.PI} position={[W / 2, H / 2, L]} scale={[W, H, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={MAT.sideWall} rotation-y={Math.PI / 2} position={[0, H / 2, L / 2]} scale={[L, H, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={MAT.sideWall} rotation-y={-Math.PI / 2} position={[W, H / 2, L / 2]} scale={[L, H, 1]} raycast={noRaycast} />

      {/* Døra på kortveggen */}
      <mesh geometry={GEO.plane} material={MAT.door} rotation-y={Math.PI} position={[DOOR.center, DOOR.height / 2, L - 0.004]} scale={[DOOR.width, DOOR.height, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={MAT.frame} rotation-y={Math.PI} position={[DOOR.center - DOOR.width / 2 + 0.1, 1, L - 0.008]} scale={[0.12, 0.03, 1]} raycast={noRaycast} />

    </group>
  )
}

function Shelf({ id, onClick, children }: { id: ShelfId; onClick: () => void; children: ReactNode }) {
  const layout = SHELF_LAYOUT[id]
  const sign = useTexture(() => signLabel(`Hylle ${id}`), [id])
  const { width: W, depth: D, height: H, post: P, board: T, boards } = SHELF
  const postX = W / 2 - P / 2

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 6) onClick()
  }

  return (
    <group position={layout.position} rotation-y={layout.rotationY}>
      <group onClick={handleClick}>
        {[-postX, postX].flatMap(x =>
          [P / 2, D - P / 2].map(z => (
            <mesh key={`${x}:${z}`} geometry={GEO.cube} material={MAT.frame} position={[x, H / 2, z]} scale={[P, H, P]} />
          ))
        )}
        {boards.map(top => (
          <group key={top}>
            <mesh geometry={GEO.cube} material={MAT.board} position={[0, top - T / 2, D / 2]} scale={[W - 0.01, T, D - 0.01]} />
            <mesh geometry={GEO.cube} material={MAT.frame} position={[0, top - T - 0.02, D - 0.008]} scale={[W, 0.04, 0.016]} />
            <mesh geometry={GEO.cube} material={MAT.frame} position={[0, top - T - 0.02, 0.008]} scale={[W, 0.04, 0.016]} />
          </group>
        ))}
        <mesh geometry={GEO.plane} position={[0, boards[3] - 0.09, D + 0.002]} scale={[0.36, 0.09, 1]}>
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      </group>
      {children}
    </group>
  )
}

// Ledig plass i hylla, vises bare i redigeringsmodus
function GhostSlot({ slot, onClick }: { slot: Slot; onClick: (slot: Slot) => void }) {
  const plus = useTexture(plusLabel, [])
  const { width: W, depth: D, height: H } = BOX_SPEC
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) onClick(slot)
  }
  return (
    <group position={shelfRest(slot, BOX_SPEC)} onClick={handleClick}>
      <mesh geometry={GEO.cube} material={MAT.ghost} position={[0, H / 2, 0]} scale={[W, H, D]} />
      <mesh geometry={GEO.plane} position={[0, H / 2, D / 2 + 0.004]} scale={[0.26, 0.26, 1]} raycast={noRaycast}>
        <meshBasicMaterial map={plus} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------- Innhold og de ulike typene ----------

function Contents({ items, width, depth, maxHeight, y }: { items: StorageItem[]; width: number; depth: number; maxHeight: number; y: number }) {
  // Pynt: fargede klosser som viser at det ligger noe der (én per ting, maks 16)
  const blocks = useMemo(() => {
    const cols = width > 0.5 ? 4 : 3
    const shown = items.slice(0, cols * 4)
    const rows = Math.max(1, Math.ceil(shown.length / cols))
    const cellW = width / cols
    const cellD = depth / rows
    return shown.map((item, i) => {
      let hash = 5381
      for (const ch of item.id) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0
      const rand = (shift: number) => ((hash >>> shift) & 0xff) / 255
      const sx = cellW * (0.5 + rand(0) * 0.35)
      const sy = maxHeight * (0.3 + rand(8) * 0.6)
      const sz = Math.min(cellD, 0.16) * (0.55 + rand(16) * 0.35)
      return {
        key: item.id,
        material: CONTENT_MATS[hash % CONTENT_MATS.length],
        scale: [sx, sy, sz] as [number, number, number],
        position: [((i % cols) - (cols - 1) / 2) * cellW, y + sy / 2, (Math.floor(i / cols) - (rows - 1) / 2) * cellD] as [number, number, number],
        rotation: (rand(20) - 0.5) * 0.6,
      }
    })
  }, [items, width, depth, maxHeight, y])

  return (
    <>
      {blocks.map(b => (
        <mesh key={b.key} geometry={GEO.cube} material={b.material} position={b.position} scale={b.scale} rotation-y={b.rotation} raycast={noRaycast} />
      ))}
    </>
  )
}

// Åpen kasse av fem tynne vegger, så man ser innholdet når lokket er av
function Tray({ spec, material, wall }: { spec: Spec; material: THREE.Material; wall: number }) {
  const { width: W, depth: D, height: H } = spec
  return (
    <>
      <mesh geometry={GEO.cube} material={material} position={[0, wall / 2, 0]} scale={[W - 0.02, wall, D - 0.02]} raycast={noRaycast} />
      <mesh geometry={GEO.cube} material={material} position={[-(W - wall) / 2, H / 2, 0]} scale={[wall, H, D]} raycast={noRaycast} />
      <mesh geometry={GEO.cube} material={material} position={[(W - wall) / 2, H / 2, 0]} scale={[wall, H, D]} raycast={noRaycast} />
      <mesh geometry={GEO.cube} material={material} position={[0, H / 2, -(D - wall) / 2]} scale={[W, H, wall]} raycast={noRaycast} />
      <mesh geometry={GEO.cube} material={material} position={[0, H / 2, (D - wall) / 2]} scale={[W, H, wall]} raycast={noRaycast} />
    </>
  )
}

type BodyProps = {
  box: StorageBox
  items: StorageItem[]
  spec: Spec
  highlighted: boolean
  lidRef: RefObject<THREE.Group>
  flapLeftRef: RefObject<THREE.Group>
  flapRightRef: RefObject<THREE.Group>
}

function PlasticBoxBody({ box, items, spec, highlighted, lidRef }: BodyProps) {
  const { width: W, depth: D, height: H, lid: L } = spec
  const numbered = box.number != null
  const front = useTexture(
    () => (numbered ? numberLabel(box.number!, box.label, highlighted) : nameLabel(box.label || 'Boks', highlighted)),
    [box.number, box.label, highlighted]
  )
  const top = useTexture(() => (numbered ? lidLabel(box.number!, highlighted) : nameLabel(box.label || 'Boks', highlighted)), [box.number, box.label, highlighted])

  let body: THREE.Material = MAT.clearBody
  let lid: THREE.Material = MAT.clearLid
  if (box.kind === 'bin') {
    const hex = colorHex(box.color)
    body = colored(`bin-${box.color}`, hex, 0.45)
    lid = colored(`bin-lid-${box.color}`, shade(hex, 0.75), 0.4)
  } else if (box.color === 'black') {
    body = MAT.blackBody
    lid = MAT.blackLid
  } else if (box.color === 'white') {
    body = MAT.whiteBody
    lid = MAT.whiteLid
  }

  return (
    <>
      <Tray spec={spec} material={body} wall={0.006} />
      {box.kind === 'box' &&
        box.color === 'clear' &&
        [-1, 1].flatMap(side =>
          [-0.15, 0.15].map(z => (
            <mesh key={`${side}:${z}`} geometry={GEO.cube} material={MAT.clip} position={[side * (W / 2 + 0.006), H - 0.025, z]} scale={[0.012, 0.045, 0.08]} raycast={noRaycast} />
          ))
        )}
      <Contents items={items} width={W - 0.06} depth={D - 0.06} maxHeight={H * 0.7} y={0.006} />
      <mesh geometry={GEO.plane} position={[0, H * 0.48, D / 2 + 0.004]} scale={numbered ? [0.27, 0.19, 1] : [0.3, 0.15, 1]} raycast={noRaycast}>
        <meshBasicMaterial map={front} toneMapped={false} />
      </mesh>
      {/* Lokket er hengslet i bakkant */}
      <group ref={lidRef} position={[0, H, -D / 2 - 0.007]}>
        <mesh geometry={GEO.cube} material={lid} position={[0, L / 2, (D + 0.014) / 2]} scale={[W + 0.014, L, D + 0.014]} raycast={noRaycast} />
        <mesh geometry={GEO.plane} rotation-x={-Math.PI / 2} position={[0, L + 0.002, (D + 0.014) * 0.7]} scale={numbered ? [0.15, 0.15, 1] : [0.3, 0.15, 1]} raycast={noRaycast}>
          <meshBasicMaterial map={top} transparent toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

function SuitcaseBody({ box, items, spec, highlighted, lidRef }: BodyProps) {
  const { width: W, depth: D, height: H, lid: L } = spec
  const shell = colored(`suitcase-${box.color}`, colorHex(box.color), 0.35)
  const top = useTexture(() => nameLabel(box.label || 'Koffert', highlighted), [box.label, highlighted])

  return (
    <>
      <Tray spec={spec} material={shell} wall={0.012} />
      <mesh geometry={GEO.cube} material={MAT.seam} position={[0, H, 0]} scale={[W + 0.006, 0.014, D + 0.006]} raycast={noRaycast} />
      {/* Håndtak på langsiden */}
      <mesh geometry={GEO.cube} material={MAT.seam} position={[0, H * 0.6, D / 2 + 0.03]} scale={[0.2, 0.026, 0.026]} raycast={noRaycast} />
      {[-0.09, 0.09].map(x => (
        <mesh key={x} geometry={GEO.cube} material={MAT.seam} position={[x, H * 0.6, D / 2 + 0.014]} scale={[0.022, 0.026, 0.03]} raycast={noRaycast} />
      ))}
      <Contents items={items} width={W - 0.1} depth={D - 0.1} maxHeight={H * 0.8} y={0.012} />
      <group ref={lidRef} position={[0, H, -D / 2]}>
        <mesh geometry={GEO.cube} material={shell} position={[0, L / 2, D / 2]} scale={[W, L, D]} raycast={noRaycast} />
        <mesh geometry={GEO.plane} rotation-x={-Math.PI / 2} position={[0, L + 0.002, D / 2]} scale={[0.36, 0.18, 1]} raycast={noRaycast}>
          <meshBasicMaterial map={top} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

function CardboardBody({ box, items, spec, highlighted, flapLeftRef, flapRightRef }: BodyProps) {
  const { width: W, depth: D, height: H, lid: T } = spec
  const front = useTexture(() => nameLabel(box.label || 'Pappboks', highlighted), [box.label, highlighted])

  return (
    <>
      <Tray spec={spec} material={MAT.cardboard} wall={0.006} />
      <Contents items={items} width={W - 0.05} depth={D - 0.05} maxHeight={H * 0.7} y={0.006} />
      <mesh geometry={GEO.plane} position={[0, H * 0.55, D / 2 + 0.004]} scale={[0.28, 0.14, 1]} raycast={noRaycast}>
        <meshBasicMaterial map={front} toneMapped={false} />
      </mesh>
      {/* To klaffer som åpnes utover, med tape langs midten */}
      <group ref={flapLeftRef} position={[-W / 2, H, 0]}>
        <mesh geometry={GEO.cube} material={MAT.cardboard} position={[W / 4, T / 2, 0]} scale={[W / 2, T, D]} raycast={noRaycast} />
        <mesh geometry={GEO.cube} material={MAT.tape} position={[W / 2 - 0.02, T + 0.001, 0]} scale={[0.04, 0.002, D]} raycast={noRaycast} />
      </group>
      <group ref={flapRightRef} position={[W / 2, H, 0]}>
        <mesh geometry={GEO.cube} material={MAT.cardboard} position={[-W / 4, T / 2, 0]} scale={[W / 2, T, D]} raycast={noRaycast} />
        <mesh geometry={GEO.cube} material={MAT.tape} position={[-W / 2 + 0.02, T + 0.001, 0]} scale={[0.04, 0.002, D]} raycast={noRaycast} />
      </group>
    </>
  )
}

function LooseBody({ box, items, spec }: BodyProps) {
  const { width: W, depth: D, height: H } = spec
  const sign = useTexture(() => signLabel(box.label || 'Løse ting'), [box.label])

  return (
    <>
      <mesh geometry={GEO.cube} material={MAT.mat} position={[0, H / 2, 0]} scale={[W, H, D]} raycast={noRaycast} />
      <mesh geometry={GEO.cube} material={MAT.frame} position={[0, 0.2, -D / 2 + 0.02]} scale={[0.015, 0.4, 0.015]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} position={[0, 0.36, -D / 2 + 0.03]} scale={[0.34, 0.085, 1]} raycast={noRaycast}>
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <Contents items={items} width={W - 0.1} depth={D - 0.12} maxHeight={0.3} y={H} />
    </>
  )
}

function Container({ box, items, open, highlighted, selected, onClick }: {
  box: StorageBox
  items: StorageItem[]
  open: boolean
  highlighted: boolean
  selected: boolean
  onClick: (id: string) => void
}) {
  const invalidate = useThree(state => state.invalidate)
  const moveRef = useRef<THREE.Group>(null)
  const lidRef = useRef<THREE.Group>(null)
  const flapLeftRef = useRef<THREE.Group>(null)
  const flapRightRef = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.25, depthWrite: false }), [])
  useEffect(() => () => glow.dispose(), [glow])
  useEffect(() => invalidate(), [open, highlighted, selected, invalidate])

  const spec = specFor(box)
  const height = visualHeight(box, spec)
  const onShelf = box.placement === 'shelf'
  const rest = onShelf ? shelfRest(box, spec, slotSpan(box.kind)) : v3(box.pos_x ?? ROOM.width / 2, 0, box.pos_z ?? ROOM.length / 2)
  const clearOut = onShelf ? shelfOut(spec, rest, SHELF_PULL.clear) : 0
  const presentOut = onShelf ? shelfOut(spec, rest, SHELF_PULL.present) : 0
  const lidAngle = box.kind === 'suitcase' ? 1.75 : 1.85

  useFrame((state, delta) => {
    const goal = open ? 1 : 0
    let p = progress.current
    if (p !== goal) {
      const step = Math.min(delta, 0.1) / (open ? 1.1 : 0.75)
      p = goal > p ? Math.min(goal, p + step) : Math.max(goal, p - step)
      progress.current = p
      invalidate()
    }
    // I hylla: først rett ut, så frem og litt opp. På gulvet: løftes litt. Til slutt åpnes lokket.
    if (onShelf) {
      const slide = smooth(p / 0.5)
      const settle = smooth((p - 0.4) / 0.4)
      moveRef.current?.position.set(0, SHELF_PULL.lift * settle, clearOut * slide + (presentOut - clearOut) * settle)
    } else {
      moveRef.current?.position.set(0, FLOOR_LIFT * smooth(p / 0.4), 0)
    }
    const lid = smooth((p - (onShelf ? 0.6 : 0.3)) / 0.4)
    if (lidRef.current) lidRef.current.rotation.x = -lidAngle * lid
    if (flapLeftRef.current) flapLeftRef.current.rotation.z = 2.1 * lid
    if (flapRightRef.current) flapRightRef.current.rotation.z = -2.1 * lid
    if (selected || highlighted) {
      glow.color.set(selected ? '#38bdf8' : '#fbbf24')
      glow.opacity = 0.2 + 0.13 * Math.sin(state.clock.elapsedTime * 4)
      invalidate()
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) onClick(box.id)
  }

  const bodyProps: BodyProps = { box, items, spec, highlighted, lidRef, flapLeftRef, flapRightRef }

  return (
    <group position={rest} rotation-y={onShelf ? 0 : deg(box.rotation)}>
      <group ref={moveRef} onClick={handleClick}>
        {/* Usynlig treffflate, så hele boksen er lett å trykke på */}
        <mesh visible={false} geometry={GEO.cube} position={[0, height / 2, 0]} scale={[spec.width, height, spec.depth]} />
        {(box.kind === 'box' || box.kind === 'bin') && <PlasticBoxBody {...bodyProps} />}
        {box.kind === 'suitcase' && <SuitcaseBody {...bodyProps} />}
        {box.kind === 'cardboard' && <CardboardBody {...bodyProps} />}
        {box.kind === 'loose' && <LooseBody {...bodyProps} />}
        {(selected || highlighted) && (
          <mesh geometry={GEO.cube} material={glow} position={[0, height / 2, 0]} scale={[spec.width + 0.05, height + 0.05, spec.depth + 0.05]} raycast={noRaycast} />
        )}
      </group>
    </group>
  )
}

// ---------- Kamera ----------

type ViewState = { position: THREE.Vector3; target: THREE.Vector3; minDistance: number; maxDistance: number }

const fitCamera = new THREE.PerspectiveCamera()
const projected = new THREE.Vector3()

// Finner avstanden der alle punktene får plass i den synlige delen av bildet
function fitDistance(camera: THREE.PerspectiveCamera, target: THREE.Vector3, direction: THREE.Vector3, points: THREE.Vector3[], visibleW: number, visibleH: number) {
  fitCamera.fov = camera.fov
  fitCamera.aspect = camera.aspect
  fitCamera.near = 0.01
  fitCamera.far = 100
  fitCamera.updateProjectionMatrix()
  const dir = direction.clone().normalize()
  const fits = (distance: number) => {
    fitCamera.position.copy(target).addScaledVector(dir, distance)
    fitCamera.lookAt(target)
    fitCamera.updateMatrixWorld(true)
    return points.every(point => {
      projected.copy(point).project(fitCamera)
      return projected.z < 1 && Math.abs(projected.x) <= 0.94 * visibleW && Math.abs(projected.y) <= 0.94 * visibleH
    })
  }
  let lo = 0.2
  let hi = 30
  if (!fits(hi)) return hi
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return hi
}

function corners(min: THREE.Vector3, max: THREE.Vector3) {
  return [0, 1, 2, 3, 4, 5, 6, 7].map(i => v3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z))
}

function visibleFraction(insets: Insets, size: { width: number; height: number }) {
  return {
    w: Math.max(0.35, 1 - insets.right / Math.max(size.width, 1)),
    h: Math.max(0.35, 1 - insets.bottom / Math.max(size.height, 1)),
  }
}

function presetView(preset: Preset, camera: THREE.PerspectiveCamera, insets: Insets, size: { width: number; height: number }): ViewState {
  const visible = visibleFraction(insets, size)
  let target: THREE.Vector3
  let direction: THREE.Vector3
  let points: THREE.Vector3[]
  if (preset === 'overview') {
    // Skrått ovenfra, bak døra og litt fra venstre, så man ser forsiden av begge hyllene
    target = v3(ROOM.width / 2, 0.75, ROOM.length / 2)
    direction = v3(-0.55, 1.05, 0.9)
    points = corners(v3(0, 0, 0), v3(ROOM.width, 1.85, ROOM.length))
  } else {
    target = toWorld(preset, v3(0, 0.95, SHELF.depth / 2))
    direction = shelfNormal(preset).add(preset === 'A' ? v3(-0.25, 0.35, 0) : v3(0, 0.35, 0.1))
    points = corners(v3(-SHELF.width / 2 - 0.05, 0, 0), v3(SHELF.width / 2 + 0.05, SHELF.height + 0.05, SHELF.depth + 0.05)).map(p => toWorld(preset, p))
  }
  const distance = fitDistance(camera, target, direction, points, visible.w, visible.h)
  return { target, position: target.clone().addScaledVector(direction.normalize(), distance), minDistance: 1.2, maxDistance: 12 }
}

function focusView(box: StorageBox, camera: THREE.PerspectiveCamera, insets: Insets, size: { width: number; height: number }): ViewState {
  const visible = visibleFraction(insets, size)
  const { center, front, onShelf } = openAnchor(box)
  const direction = onShelf ? front.clone().add(UP) : front.clone().multiplyScalar(0.8).add(v3(0, 1.3, 0))
  // Se litt inn fra midten av rommet, så den andre hylla ikke kommer i veien for kameraet
  const toCenter = v3(ROOM.width / 2 - center.x, 0, ROOM.length / 2 - center.z)
  const sideways = toCenter.sub(front.clone().multiplyScalar(toCenter.dot(front)))
  if (sideways.lengthSq() > 0.0025) direction.add(sideways.normalize().multiplyScalar(0.5))
  const half = v3(0.4, 0.32, 0.4)
  const points = corners(center.clone().sub(half), center.clone().add(half))
  const distance = fitDistance(camera, center, direction, points, visible.w, visible.h)
  return { target: center, position: center.clone().addScaledVector(direction.normalize(), distance), minDistance: 0.5, maxDistance: 5 }
}

async function moveTo(c: CameraControlsImpl, view: ViewState, transition: boolean, rig: { seq: number }) {
  const seq = ++rig.seq
  // Avstandsgrensene slås av under overgangen, ellers hopper kameraet
  c.minDistance = 0
  c.maxDistance = Infinity
  await c.setLookAt(view.position.x, view.position.y, view.position.z, view.target.x, view.target.y, view.target.z, transition)
  if (rig.seq !== seq) return
  c.minDistance = view.minDistance
  c.maxDistance = view.maxDistance
}

function CameraRig({ preset, presetNonce, focusBox, insets }: { preset: Preset; presetNonce: number; focusBox: StorageBox | null; insets: Insets }) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera
  const gl = useThree(state => state.gl)
  const size = useThree(state => state.size)
  const invalidate = useThree(state => state.invalidate)
  const controlsRef = useRef<CameraControlsImpl | null>(null)
  const rig = useRef({ seq: 0 })
  const saved = useRef<ViewState | null>(null)
  const initialNonce = useRef(presetNonce)
  const latest = useRef({ preset, insets, size })
  latest.current = { preset, insets, size }

  // Vidvinkel på mobil (stående), litt smalere på bred skjerm
  useEffect(() => {
    camera.fov = size.width < size.height ? 70 : 50
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, invalidate])

  useEffect(() => {
    const controls = new CameraControlsImpl(camera, gl.domElement)
    controls.smoothTime = 0.4
    controls.draggingSmoothTime = 0.08
    controls.minPolarAngle = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.dollyToCursor = true
    controls.mouseButtons.left = ACTION.ROTATE
    controls.mouseButtons.right = ACTION.TRUCK
    controls.mouseButtons.wheel = ACTION.DOLLY
    controls.touches.one = ACTION.TOUCH_ROTATE
    controls.touches.two = ACTION.TOUCH_DOLLY_TRUCK
    controls.touches.three = ACTION.TOUCH_TRUCK
    controls.setBoundary(new THREE.Box3(v3(-0.5, 0, -0.5), v3(ROOM.width + 0.5, ROOM.height, ROOM.length + 0.5)))
    const wake = () => invalidate()
    controls.addEventListener('update', wake)
    controls.addEventListener('control', wake)
    controls.addEventListener('transitionstart', wake)
    controlsRef.current = controls
    const { size: currentSize } = latest.current
    camera.fov = currentSize.width < currentSize.height ? 70 : 50
    camera.updateProjectionMatrix()
    moveTo(controls, presetView(latest.current.preset, camera, latest.current.insets, currentSize), false, rig.current)
    invalidate()
    return () => {
      controls.removeEventListener('update', wake)
      controls.removeEventListener('control', wake)
      controls.removeEventListener('transitionstart', wake)
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl, invalidate])

  useEffect(() => {
    const c = controlsRef.current
    if (!c || presetNonce === initialNonce.current) return
    saved.current = null
    moveTo(c, presetView(latest.current.preset, camera, latest.current.insets, latest.current.size), true, rig.current)
    invalidate()
  }, [presetNonce, camera, invalidate])

  const focusKey = focusBox
    ? [focusBox.id, focusBox.placement, focusBox.shelf, focusBox.level, focusBox.slot, focusBox.pos_x, focusBox.pos_z, focusBox.rotation, focusBox.kind].join(':')
    : null
  useEffect(() => {
    const c = controlsRef.current
    if (!c) return
    if (focusBox) {
      if (!saved.current) {
        saved.current = {
          position: c.getPosition(new THREE.Vector3(), true),
          target: c.getTarget(new THREE.Vector3(), true),
          minDistance: c.minDistance,
          maxDistance: c.maxDistance,
        }
      }
      moveTo(c, focusView(focusBox, camera, latest.current.insets, latest.current.size), true, rig.current)
    } else if (saved.current) {
      const view = saved.current
      saved.current = null
      moveTo(c, view, true, rig.current)
    }
    invalidate()
  }, [focusKey]) // focusBox leses fra samme render som focusKey

  useFrame((_, delta) => {
    const c = controlsRef.current
    if (c && c.update(Math.min(delta, 0.1))) invalidate()
  }, -1)

  return null
}

// Flytter midtpunktet i bildet opp (eller til venstre) når et panel dekker en del av skjermen
function ViewOffset({ insets }: { insets: Insets }) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera
  const size = useThree(state => state.size)
  const invalidate = useThree(state => state.invalidate)
  const current = useRef({ x: 0, y: 0 })
  useEffect(() => invalidate(), [insets.bottom, insets.right, invalidate])

  useFrame((_, delta) => {
    const goalX = insets.right / 2
    const goalY = insets.bottom / 2
    const c = current.current
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 7)
    c.x = Math.abs(goalX - c.x) < 0.5 ? goalX : c.x + (goalX - c.x) * k
    c.y = Math.abs(goalY - c.y) < 0.5 ? goalY : c.y + (goalY - c.y) * k
    if (c.x === 0 && c.y === 0) {
      if (camera.view?.enabled) camera.clearViewOffset()
    } else {
      camera.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height)
    }
    if (c.x !== goalX || c.y !== goalY) invalidate()
  })

  return null
}

// ---------- Scenen ----------

export default function StorageScene({
  boxes,
  items,
  openId,
  highlightIds,
  editMode,
  editSelectedId,
  preset,
  presetNonce,
  insets,
  onBoxClick,
  onSlotClick,
  onFloorClick,
  onBackgroundClick,
}: {
  boxes: StorageBox[]
  items: StorageItem[]
  openId: string | null
  highlightIds: Set<string>
  editMode: boolean
  editSelectedId: string | null
  preset: Preset
  presetNonce: number
  insets: Insets
  onBoxClick: (id: string) => void
  onSlotClick: (slot: Slot) => void
  onFloorClick: (point: { x: number; z: number }) => void
  onBackgroundClick: () => void
}) {
  const openBox = boxes.find(b => b.id === openId && b.placement !== 'elsewhere') ?? null

  const itemsByBox = useMemo(() => {
    const map = new Map<string, StorageItem[]>()
    for (const item of items) {
      const list = map.get(item.box_id)
      if (list) list.push(item)
      else map.set(item.box_id, [item])
    }
    return map
  }, [items])

  const renderContainer = (box: StorageBox) => (
    <Container
      key={box.id}
      box={box}
      items={itemsByBox.get(box.id) ?? []}
      open={box.id === openId}
      highlighted={highlightIds.has(box.id)}
      selected={box.id === editSelectedId}
      onClick={onBoxClick}
    />
  )

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 70, near: 0.02, far: 80, position: [-1.5, 3.5, 5] }}
      onPointerMissed={onBackgroundClick}
    >
      <color attach="background" args={['#1c1917']} />
      <hemisphereLight args={['#fff8ee', '#5c544c', 1.3]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[ROOM.width / 2, ROOM.height - 0.2, ROOM.length / 2]} intensity={3} decay={1.2} color="#fff1dc" />
      <directionalLight position={[3, 6, 5]} intensity={0.6} />

      <Room onFloorClick={onFloorClick} />

      {SHELVES.map(shelf => (
        <Shelf key={shelf} id={shelf} onClick={onBackgroundClick}>
          {boxes.filter(box => box.placement === 'shelf' && box.shelf === shelf).map(renderContainer)}
          {editMode &&
            LEVELS_TOP_DOWN.flatMap(level =>
              SLOTS.map(slotNumber => {
                const slot: Slot = { shelf, level, slot: slotNumber }
                return boxInSlot(boxes, slot) ? null : <GhostSlot key={`${level}:${slotNumber}`} slot={slot} onClick={onSlotClick} />
              })
            )}
        </Shelf>
      ))}

      {boxes.filter(box => box.placement === 'floor').map(renderContainer)}

      <CameraRig preset={preset} presetNonce={presetNonce} focusBox={openBox} insets={insets} />
      <ViewOffset insets={insets} />
    </Canvas>
  )
}
