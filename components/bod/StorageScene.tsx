'use client'

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import CameraControlsImpl from 'camera-controls'
import {
  COLORS,
  ROOMS,
  SHELVES,
  SLOTS,
  TOP_GAP,
  TOP_SHELVES,
  boxInSlot,
  dimensionsOf,
  heightBelow,
  levelsTopDown,
  rootOf,
  spanOf,
  type RoomId,
  type RoomSpec,
  type ShelfId,
  type Slot,
  type StorageBox,
  type StorageItem,
} from '@/lib/storage'

CameraControlsImpl.install({ THREE })
const { ACTION } = CameraControlsImpl

export type Preset = 'overview' | 'A' | 'B' | 'side'
export type Insets = { bottom: number; right: number }

// Alle mål i meter. x går langs kortveggen, z langs langveggen, døra står på z = length.
// Hyllene står i kjellerboden.
const ROOM = ROOMS.kjeller
// Biltema oppbevaringshylle 1000 kg: 160 × 60 × 180 cm med fire hylleplater
const SHELF = { width: 1.6, depth: 0.6, height: 1.8, post: 0.035, board: 0.018, boards: [0.12, 0.67, 1.22, 1.77] }
const SLOT_PITCH = 0.385
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

const BOX_SPEC = dimensionsOf({ kind: 'box', size: 'normal' })
const LOW_SPEC = dimensionsOf({ kind: 'box', size: 'low' })

// Løse ting på gulvet får en større matte enn i hylla
function specFor(box: StorageBox): Spec {
  if (box.kind === 'loose' && box.placement === 'floor') return { width: 0.6, depth: 0.45, height: 0.012, lid: 0 }
  return dimensionsOf(box)
}

const visualHeight = (box: StorageBox, spec: Spec) => (box.kind === 'loose' ? 0.4 : spec.height + spec.lid)

// Midt på plassen(e) den står på. En koffert eller lang boks står midt over to plasser.
function shelfRest(slot: Pick<StorageBox, 'slot' | 'level'>, spec: Spec, span = 1) {
  return v3(((slot.slot ?? 1) - 2.5 + (span - 1) / 2) * SLOT_PITCH, SHELF.boards[(slot.level ?? 1) - 1], 0.01 + spec.depth / 2)
}

// Der en åpnet boks havner, og hvilken vei forsiden peker (brukes av kameraet)
function openAnchor(box: StorageBox, boxes: StorageBox[]) {
  const root = rootOf(boxes, box)
  const spec = specFor(box)
  const height = visualHeight(box, spec)
  const below = heightBelow(boxes, box)
  if (root.placement === 'shelf' && root.shelf) {
    const rest = shelfRest(root, specFor(root), spanOf(root))
    const local = v3(rest.x, rest.y + below + SHELF_PULL.lift + height / 2, SHELF.depth + spec.depth / 2 + SHELF_PULL.present)
    return { center: toWorld(root.shelf, local), front: shelfNormal(root.shelf), onShelf: true }
  }
  // Ting som står oppå hverandre på gulvet er rotert i forhold til den under
  let rotation = 0
  for (let current: StorageBox | null = box, i = 0; current && i < 10; i++) {
    rotation += deg(current.rotation)
    current = current.id === root.id ? null : boxes.find(b => b.id === current!.stack_on) ?? null
  }
  return {
    center: v3(root.pos_x ?? ROOMS[root.room].width / 2, below + FLOOR_LIFT + height / 2, root.pos_z ?? ROOMS[root.room].length / 2),
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
  loftFloor: new THREE.MeshStandardMaterial({ color: '#7f705f', roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: '#94532f', roughness: 0.8 }),
  slope: new THREE.MeshStandardMaterial({ color: '#f1eee9', roughness: 0.9, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
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

// Netting-dør med treramme, som i loftsboden
function meshDoorTexture() {
  return canvasTexture(256, 512, ctx => {
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.9)'
    ctx.lineWidth = 2
    for (let x = 20; x < 256; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 512)
      ctx.stroke()
    }
    for (let y = 20; y < 512; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(256, y)
      ctx.stroke()
    }
    ctx.strokeStyle = '#c99a63'
    ctx.lineWidth = 18
    ctx.strokeRect(9, 9, 238, 494)
    ctx.beginPath()
    ctx.moveTo(20, 490)
    ctx.lineTo(236, 22)
    ctx.stroke()
  })
}

function useTexture(factory: () => THREE.Texture, deps: unknown[]) {
  const texture = useMemo(factory, deps)
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

// ---------- Rommet og hyllene ----------

// Omrisset av en sidevegg som punkter (z, y). Med skråtak går taket ned mot innerste vegg.
function wallOutline(spec: RoomSpec): [number, number][] {
  const { length: L, height: H, slope } = spec
  if (!slope) return [[0, 0], [L, 0], [L, H], [0, H]]
  return [[0, 0], [L, 0], [L, H], [L - slope.flat, H], [0, slope.low]]
}

function SideWall({ spec, side, material }: { spec: RoomSpec; side: 'left' | 'right'; material: THREE.Material }) {
  const geometry = useMemo(() => {
    // Venstre vegg vender mot +x og må speiles for at z skal peke riktig vei
    const points = wallOutline(spec).map(([z, y]) => new THREE.Vector2(side === 'left' ? -z : z, y))
    return new THREE.ShapeGeometry(new THREE.Shape(points))
  }, [spec, side])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[side === 'left' ? 0 : spec.width, 0, 0]}
      rotation-y={side === 'left' ? Math.PI / 2 : -Math.PI / 2}
      raycast={noRaycast}
    />
  )
}

function Room({ roomId, onFloorClick }: { roomId: RoomId; onFloorClick: (point: { x: number; z: number }) => void }) {
  const spec = ROOMS[roomId]
  const { width: W, length: L, height: H, door, slope } = spec
  const loft = roomId === 'loft'
  const farHeight = slope ? slope.low : H
  const meshDoor = useTexture(meshDoorTexture, [])

  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 6) onFloorClick({ x: e.point.x, z: e.point.z })
  }

  // Veggene er enkeltsidige og vender inn i rommet. Sett utenfra blir de usynlige,
  // så man kan se inn i boden som i et dukkehus. Skråtaket er halvgjennomsiktig.
  const slopeLength = slope ? Math.hypot(L - slope.flat, H - slope.low) : 0
  return (
    <group>
      <mesh geometry={GEO.plane} material={loft ? MAT.loftFloor : MAT.floor} rotation-x={-Math.PI / 2} position={[W / 2, 0, L / 2]} scale={[W, L, 1]} onClick={handleFloorClick} />
      <mesh geometry={GEO.plane} material={loft ? MAT.wood : MAT.wall} position={[W / 2, farHeight / 2, 0]} scale={[W, farHeight, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={MAT.wall} rotation-y={Math.PI} position={[W / 2, H / 2, L]} scale={[W, H, 1]} raycast={noRaycast} />
      <SideWall spec={spec} side="left" material={loft ? MAT.wall : MAT.sideWall} />
      <SideWall spec={spec} side="right" material={loft ? MAT.wood : MAT.sideWall} />
      {slope && (
        <mesh
          geometry={GEO.plane}
          material={MAT.slope}
          position={[W / 2, (slope.low + H) / 2, (L - slope.flat) / 2]}
          rotation-x={Math.atan2(L - slope.flat, H - slope.low)}
          scale={[W, slopeLength, 1]}
          raycast={noRaycast}
        />
      )}

      {/* Døra på kortveggen */}
      {loft ? (
        <mesh geometry={GEO.plane} rotation-y={Math.PI} position={[door.center, door.height / 2, L - 0.004]} scale={[door.width, door.height, 1]} raycast={noRaycast}>
          <meshStandardMaterial map={meshDoor} transparent alphaTest={0.1} roughness={0.8} />
        </mesh>
      ) : (
        <>
          <mesh geometry={GEO.plane} material={MAT.door} rotation-y={Math.PI} position={[door.center, door.height / 2, L - 0.004]} scale={[door.width, door.height, 1]} raycast={noRaycast} />
          <mesh geometry={GEO.plane} material={MAT.frame} rotation-y={Math.PI} position={[door.center - door.width / 2 + 0.1, 1, L - 0.008]} scale={[0.12, 0.03, 1]} raycast={noRaycast} />
        </>
      )}
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
  const spec = slot.level === 4 ? LOW_SPEC : BOX_SPEC
  const { width: W, depth: D, height: H } = spec
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) onClick(slot)
  }
  return (
    <group position={shelfRest(slot, spec)} onClick={handleClick}>
      <mesh geometry={GEO.cube} material={MAT.ghost} position={[0, H / 2, 0]} scale={[W, H, D]} />
      <mesh geometry={GEO.plane} position={[0, H / 2, D / 2 + 0.004]} scale={[Math.min(0.26, H * 0.85), Math.min(0.26, H * 0.85), 1]} raycast={noRaycast}>
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

  // Klistremerket krympes på lave bokser
  const [stickerW, stickerH] = numbered ? [0.27, 0.19] : [0.3, 0.15]
  const fit = Math.min(1, (H * 0.8) / stickerH)
  const stickerScale: [number, number, number] = [stickerW * fit, stickerH * fit, 1]

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
      <mesh geometry={GEO.plane} position={[0, H * 0.48, D / 2 + 0.004]} scale={stickerScale} raycast={noRaycast}>
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

type SceneContext = {
  itemsByBox: Map<string, StorageItem[]>
  childByBase: Map<string, StorageBox>
  openId: string | null
  highlightIds: Set<string>
  selectedId: string | null
  onClick: (id: string) => void
}

const NO_ITEMS: StorageItem[] = []

// shelfZ er avstanden fra bakveggen til midten av stabelen når den står i en hylle, ellers null
function Container({ box, ctx, shelfZ, position, rotation }: {
  box: StorageBox
  ctx: SceneContext
  shelfZ: number | null
  position: THREE.Vector3
  rotation: number
}) {
  const invalidate = useThree(state => state.invalidate)
  const moveRef = useRef<THREE.Group>(null)
  const stackRef = useRef<THREE.Group>(null)
  const lidRef = useRef<THREE.Group>(null)
  const flapLeftRef = useRef<THREE.Group>(null)
  const flapRightRef = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.25, depthWrite: false }), [])
  useEffect(() => () => glow.dispose(), [glow])

  const open = box.id === ctx.openId
  const highlighted = ctx.highlightIds.has(box.id)
  const selected = box.id === ctx.selectedId
  useEffect(() => invalidate(), [open, highlighted, selected, invalidate])

  const spec = specFor(box)
  const height = visualHeight(box, spec)
  const top = spec.height + spec.lid + 0.002
  const onShelf = shelfZ !== null
  const clearOut = onShelf ? SHELF.depth + spec.depth / 2 + SHELF_PULL.clear - shelfZ : 0
  const presentOut = onShelf ? SHELF.depth + spec.depth / 2 + SHELF_PULL.present - shelfZ : 0
  const lidAngle = box.kind === 'suitcase' ? 1.75 : 1.85
  const child = ctx.childByBase.get(box.id) ?? null
  // Når boksen åpnes, løftes det som står oppå over og settes ved siden av
  const aside = child ? spec.width / 2 + specFor(child).width / 2 + 0.05 : 0

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
    // Det som står oppå løftes av og settes ved siden av (på gulvet hvis stabelen står på gulvet)
    if (stackRef.current) {
      const t = smooth((p - (onShelf ? 0.4 : 0.05)) / 0.45)
      stackRef.current.position.set(aside * t, top + 0.25 * Math.sin(Math.PI * t) - (onShelf ? 0 : top * t), 0)
    }
    if (selected || highlighted) {
      glow.color.set(selected ? '#38bdf8' : '#fbbf24')
      glow.opacity = 0.2 + 0.13 * Math.sin(state.clock.elapsedTime * 4)
      invalidate()
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) ctx.onClick(box.id)
  }

  const bodyProps: BodyProps = { box, items: ctx.itemsByBox.get(box.id) ?? NO_ITEMS, spec, highlighted, lidRef, flapLeftRef, flapRightRef }

  return (
    <group position={position} rotation-y={rotation}>
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
        <group ref={stackRef} position={[0, top, 0]}>
          {child && (
            <Container
              box={child}
              ctx={ctx}
              shelfZ={shelfZ}
              position={ORIGIN}
              rotation={onShelf ? 0 : deg(child.rotation)}
            />
          )}
        </group>
      </group>
    </group>
  )
}

const ORIGIN = new THREE.Vector3()

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

function presetView(preset: Preset, roomId: RoomId, camera: THREE.PerspectiveCamera, insets: Insets, size: { width: number; height: number }): ViewState {
  const visible = visibleFraction(insets, size)
  const spec = ROOMS[roomId]
  let target: THREE.Vector3
  let direction: THREE.Vector3
  let points: THREE.Vector3[]
  if (roomId === 'loft' && preset === 'side') {
    // Fra siden, gjennom veggen, så man ser hvordan taket skråner
    target = v3(spec.width / 2, spec.height / 2, spec.length / 2)
    direction = v3(-1, 0.25, 0.05)
    points = corners(v3(0, 0, 0), v3(spec.width, spec.height, spec.length))
  } else if (roomId === 'loft' || preset === 'overview' || preset === 'side') {
    // Skrått ovenfra og bak døra. I kjelleren litt fra venstre, så man ser forsiden av begge hyllene.
    const kjeller = roomId === 'kjeller'
    target = v3(spec.width / 2, kjeller ? 0.75 : 0.5, spec.length / 2)
    // Loftet er smalt og langt, så det ses best skrått fra siden, med døra nærmest
    direction = kjeller ? v3(-0.55, 1.05, 0.9) : v3(-1, 1.15, 0.7)
    points = corners(v3(0, 0, 0), v3(spec.width, kjeller ? SHELF.height + TOP_GAP : 1.4, spec.length))
  } else {
    target = toWorld(preset, v3(0, 0.95, SHELF.depth / 2))
    direction = shelfNormal(preset).add(preset === 'A' ? v3(-0.25, 0.35, 0) : v3(0, 0.35, 0.1))
    const topHeight = TOP_SHELVES.includes(preset) ? SHELF.height + TOP_GAP : SHELF.height + 0.05
    points = corners(v3(-SHELF.width / 2 - 0.05, 0, 0), v3(SHELF.width / 2 + 0.05, topHeight, SHELF.depth + 0.05)).map(p => toWorld(preset, p))
  }
  const distance = fitDistance(camera, target, direction, points, visible.w, visible.h)
  return { target, position: target.clone().addScaledVector(direction.normalize(), distance), minDistance: 1.2, maxDistance: 12 }
}

function focusView(box: StorageBox, boxes: StorageBox[], camera: THREE.PerspectiveCamera, insets: Insets, size: { width: number; height: number }): ViewState {
  const visible = visibleFraction(insets, size)
  const { center, front, onShelf } = openAnchor(box, boxes)
  const direction = onShelf ? front.clone().add(UP) : front.clone().multiplyScalar(0.8).add(v3(0, 1.3, 0))
  // Se litt inn fra midten av rommet, så den andre hylla ikke kommer i veien for kameraet
  const room = ROOMS[rootOf(boxes, box).room]
  const toCenter = v3(room.width / 2 - center.x, 0, room.length / 2 - center.z)
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

function CameraRig({ preset, roomId, presetNonce, focusBox, boxes, insets }: {
  preset: Preset
  roomId: RoomId
  presetNonce: number
  focusBox: StorageBox | null
  boxes: StorageBox[]
  insets: Insets
}) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera
  const gl = useThree(state => state.gl)
  const size = useThree(state => state.size)
  const invalidate = useThree(state => state.invalidate)
  const controlsRef = useRef<CameraControlsImpl | null>(null)
  const rig = useRef({ seq: 0 })
  const saved = useRef<ViewState | null>(null)
  const initialNonce = useRef(presetNonce)
  const latest = useRef({ preset, roomId, insets, size, boxes })
  latest.current = { preset, roomId, insets, size, boxes }

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
    const wake = () => invalidate()
    controls.addEventListener('update', wake)
    controls.addEventListener('control', wake)
    controls.addEventListener('transitionstart', wake)
    controlsRef.current = controls
    const { size: currentSize } = latest.current
    camera.fov = currentSize.width < currentSize.height ? 70 : 50
    camera.updateProjectionMatrix()
    moveTo(controls, presetView(latest.current.preset, latest.current.roomId, camera, latest.current.insets, currentSize), false, rig.current)
    invalidate()
    return () => {
      controls.removeEventListener('update', wake)
      controls.removeEventListener('control', wake)
      controls.removeEventListener('transitionstart', wake)
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl, invalidate])

  // Kameraet kan ikke se mot et punkt langt utenfor boden
  useEffect(() => {
    const spec = ROOMS[roomId]
    controlsRef.current?.setBoundary(new THREE.Box3(v3(-0.5, 0, -0.5), v3(spec.width + 0.5, spec.height, spec.length + 0.5)))
  }, [roomId, camera, gl])

  useEffect(() => {
    const c = controlsRef.current
    if (!c || presetNonce === initialNonce.current) return
    saved.current = null
    moveTo(c, presetView(latest.current.preset, latest.current.roomId, camera, latest.current.insets, latest.current.size), true, rig.current)
    invalidate()
  }, [presetNonce, camera, invalidate])

  // Kameraet flytter seg på nytt hvis den åpne boksen (eller det den står på) flyttes
  const focusKey = focusBox
    ? `${focusBox.id}:${openAnchor(focusBox, boxes)
        .center.toArray()
        .map(n => n.toFixed(2))
        .join(',')}`
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
      moveTo(c, focusView(focusBox, latest.current.boxes, camera, latest.current.insets, latest.current.size), true, rig.current)
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
  room,
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
  room: RoomId
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
  const openBox = boxes.find(b => b.id === openId) ?? null
  const openRoot = openBox ? rootOf(boxes, openBox) : null
  const focusBox = openBox && openRoot && openRoot.placement !== 'elsewhere' && openRoot.room === room ? openBox : null
  const spec = ROOMS[room]

  const itemsByBox = useMemo(() => {
    const map = new Map<string, StorageItem[]>()
    for (const item of items) {
      const list = map.get(item.box_id)
      if (list) list.push(item)
      else map.set(item.box_id, [item])
    }
    return map
  }, [items])

  const childByBase = useMemo(() => {
    const map = new Map<string, StorageBox>()
    for (const box of boxes) if (box.placement === 'stacked' && box.stack_on) map.set(box.stack_on, box)
    return map
  }, [boxes])

  const ctx: SceneContext = { itemsByBox, childByBase, openId, highlightIds, selectedId: editSelectedId, onClick: onBoxClick }

  const shelfContainer = (box: StorageBox) => {
    const rest = shelfRest(box, specFor(box), spanOf(box))
    return <Container key={box.id} box={box} ctx={ctx} shelfZ={rest.z} position={rest} rotation={0} />
  }

  const floorContainer = (box: StorageBox) => (
    <Container
      key={box.id}
      box={box}
      ctx={ctx}
      shelfZ={null}
      position={v3(box.pos_x ?? spec.width / 2, 0, box.pos_z ?? spec.length / 2)}
      rotation={deg(box.rotation)}
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
      <pointLight
        position={room === 'loft' ? [spec.width / 2, spec.height - 0.25, spec.length - 0.5] : [spec.width / 2, spec.height - 0.2, spec.length / 2]}
        intensity={3}
        decay={1.2}
        color="#fff1dc"
      />
      <directionalLight position={[3, 6, 5]} intensity={0.6} />

      <Room roomId={room} onFloorClick={onFloorClick} />

      {room === 'kjeller' && SHELVES.map(shelf => (
        <Shelf key={shelf} id={shelf} onClick={onBackgroundClick}>
          {boxes.filter(box => box.placement === 'shelf' && box.shelf === shelf).map(shelfContainer)}
          {editMode &&
            levelsTopDown(shelf).flatMap(level =>
              SLOTS.map(slotNumber => {
                const slot: Slot = { shelf, level, slot: slotNumber }
                return boxInSlot(boxes, slot) ? null : <GhostSlot key={`${level}:${slotNumber}`} slot={slot} onClick={onSlotClick} />
              })
            )}
        </Shelf>
      ))}

      {boxes.filter(box => box.placement === 'floor' && box.room === room).map(floorContainer)}

      <CameraRig preset={preset} roomId={room} presetNonce={presetNonce} focusBox={focusBox} boxes={boxes} insets={insets} />
      <ViewOffset insets={insets} />
    </Canvas>
  )
}
