import seed from './bodSeed.json'

export type ShelfId = 'A' | 'B'
export type ContainerKind = 'box' | 'bin' | 'suitcase' | 'cardboard' | 'loose'
export type BoxSize = 'normal' | 'low' | 'long'
export type Placement = 'shelf' | 'floor' | 'elsewhere' | 'stacked'

// En "boks" er alt som kan inneholde ting: plastbokser, kofferter, pappbokser og løse ting på gulvet
export type StorageBox = {
  id: string
  kind: ContainerKind
  size: BoxSize // bare for plastbokser
  number: number | null // nummeret på lappen (plastboksene)
  label: string
  color: string
  placement: Placement
  shelf: ShelfId | null
  level: number | null // 1 = nederst, 3 = øverst, 4 = oppå øverste hylleplate
  slot: number | null // 1 = lengst til venstre når man står foran hylla
  pos_x: number | null // meter fra venstre vegg (på gulvet)
  pos_z: number | null // meter fra innerste vegg (på gulvet)
  rotation: number // grader
  stack_on: string | null // boksen den står oppå
  location: string // hvor den står hvis den ikke er i boden
  created_at: string
}

export type StorageItem = {
  id: string
  box_id: string
  name: string
  created_at: string
}

export type Slot = { shelf: ShelfId; level: number; slot: number }
export type Shape = Pick<StorageBox, 'kind' | 'size'>

export const SHELVES: ShelfId[] = ['A', 'B']
export const SLOTS = [1, 2, 3, 4]

// Hyller med plass til lave ting oppå øverste hylleplate
export const TOP_SHELVES: ShelfId[] = ['A']
export const levelsTopDown = (shelf: ShelfId) => (TOP_SHELVES.includes(shelf) ? [4, 3, 2, 1] : [3, 2, 1])

// Fri høyde i meter: mellom to hylleplater, over øverste hylleplate og på gulvet
export const SHELF_GAP = 0.53
export const TOP_GAP = 0.25
export const FLOOR_GAP = 2
export const clearance = (level: number) => (level === 4 ? TOP_GAP : SHELF_GAP)

export const SHELF_NAMES: Record<ShelfId, string> = {
  A: 'Hylle A · innerst',
  B: 'Hylle B · høyre vegg',
}

export const LEVEL_NAMES: Record<number, string> = {
  4: 'på toppen',
  3: 'øverst',
  2: 'midten',
  1: 'nederst',
}

export const COLORS: Record<string, { label: string; hex: string; swatch: string }> = {
  clear: { label: 'Gjennomsiktig', hex: '#d3dfeb', swatch: 'bg-sky-100 border-sky-300' },
  black: { label: 'Svart', hex: '#26292e', swatch: 'bg-stone-800 border-stone-900' },
  white: { label: 'Hvit', hex: '#f2f2ef', swatch: 'bg-white border-stone-300' },
  gray: { label: 'Grå', hex: '#7b828c', swatch: 'bg-stone-400 border-stone-500' },
  blue: { label: 'Blå', hex: '#2f5fa8', swatch: 'bg-blue-600 border-blue-700' },
  red: { label: 'Rød', hex: '#b23a3a', swatch: 'bg-red-600 border-red-700' },
  green: { label: 'Grønn', hex: '#3f7d4f', swatch: 'bg-green-700 border-green-800' },
  purple: { label: 'Lilla', hex: '#7c4dbd', swatch: 'bg-purple-600 border-purple-700' },
  orange: { label: 'Oransje', hex: '#e07b2c', swatch: 'bg-orange-500 border-orange-600' },
  brown: { label: 'Brun', hex: '#b58a55', swatch: 'bg-amber-700 border-amber-800' },
}

export const KINDS: Record<ContainerKind, { name: string; icon: string; colors: string[] }> = {
  box: { name: 'Plastboks', icon: '📦', colors: ['clear', 'black', 'white'] },
  suitcase: { name: 'Koffert', icon: '🧳', colors: ['black', 'gray', 'blue', 'red', 'green', 'purple'] },
  cardboard: { name: 'Pappboks', icon: '🟫', colors: ['brown'] },
  bin: { name: 'Annen boks', icon: '🗃️', colors: ['purple', 'blue', 'orange', 'green', 'red', 'gray', 'white', 'black'] },
  loose: { name: 'Løse ting', icon: '🧺', colors: ['gray'] },
}

export const KIND_ORDER: ContainerKind[] = ['box', 'suitcase', 'cardboard', 'bin', 'loose']

export const SIZES: Record<BoxSize, { name: string; hint: string }> = {
  normal: { name: 'Vanlig', hint: 'ca. 31 cm høy' },
  low: { name: 'Lav', hint: 'ca. 17 cm høy' },
  long: { name: 'Lav og lang', hint: 'tar to plasser' },
}
export const SIZE_ORDER: BoxSize[] = ['normal', 'low', 'long']
export const hasSizes = (kind: ContainerKind) => kind === 'box' || kind === 'bin'

// ---------- Mål ----------

export type Dimensions = { width: number; depth: number; height: number; lid: number }

export function dimensionsOf({ kind, size }: Shape): Dimensions {
  switch (kind) {
    case 'box':
    case 'bin':
      // SmartStore Classic/Dry 45 er ca. 59 × 39 × 31 cm og står med langsiden innover i hylla
      if (size === 'low') return { width: 0.375, depth: 0.59, height: 0.15, lid: 0.02 }
      if (size === 'long') return { width: 0.75, depth: 0.59, height: 0.15, lid: 0.02 }
      return { width: 0.375, depth: 0.59, height: 0.31, lid: 0.025 }
    case 'suitcase':
      return { width: 0.7, depth: 0.47, height: 0.13, lid: 0.13 }
    case 'cardboard':
      return { width: 0.35, depth: 0.5, height: 0.35, lid: 0.005 }
    case 'loose':
      return { width: 0.36, depth: 0.55, height: 0.012, lid: 0 }
  }
}

// Høyden den tar opp (løse ting regnes som 20 cm)
export const heightOf = (shape: Shape) => (shape.kind === 'loose' ? 0.2 : dimensionsOf(shape).height + dimensionsOf(shape).lid)

// Hvor mange plasser i hylla den tar
export const spanOf = (shape: Shape) => (shape.kind === 'suitcase' || (hasSizes(shape.kind) && shape.size === 'long') ? 2 : 1)

// ---------- Navn og plassering ----------

export function boxName(box: Pick<StorageBox, 'kind' | 'number' | 'label'>): string {
  if (box.kind === 'box' && box.number != null) return `Boks ${box.number}`
  return box.label || KINDS[box.kind].name
}

// Tekst som vises etter navnet, f.eks. «Boks 1 · Servise + div»
export function boxLabelSuffix(box: StorageBox): string {
  return box.kind === 'box' && box.number != null ? box.label : ''
}

export function slotOf(box: StorageBox): Slot | null {
  if (box.placement !== 'shelf' || !box.shelf || box.level == null || box.slot == null) return null
  return { shelf: box.shelf, level: box.level, slot: box.slot }
}

export function describeSlot({ shelf, level, slot }: Slot, span = 1): string {
  return `Hylle ${shelf} · ${LEVEL_NAMES[level]} · plass ${span > 1 ? `${slot}–${slot + span - 1}` : slot}`
}

export function describePlacement(box: StorageBox, boxes: StorageBox[], depth = 0): string {
  const slot = slotOf(box)
  if (slot) return describeSlot(slot, spanOf(box))
  if (box.placement === 'floor') return 'På gulvet i boden'
  if (box.placement === 'stacked') {
    const base = baseOf(boxes, box)
    return base && depth < 10 ? `Oppå ${boxName(base)} · ${describePlacement(base, boxes, depth + 1)}` : 'Oppå en annen boks'
  }
  return box.location ? `Utenfor boden · ${box.location}` : 'Utenfor boden'
}

// ---------- Hyllene ----------

// Boksen som dekker plassen (en koffert eller lang boks dekker også plassen til høyre for seg)
export function boxInSlot(boxes: StorageBox[], slot: Slot, exceptId?: string): StorageBox | null {
  return (
    boxes.find(box => {
      if (box.id === exceptId) return false
      const s = slotOf(box)
      return s !== null && s.shelf === slot.shelf && s.level === slot.level && slot.slot >= s.slot && slot.slot < s.slot + spanOf(box)
    }) ?? null
  )
}

// Første plass der noe kan stå og samtidig dekke plassen man trykket på, eller null hvis det ikke får plass.
// tower = høyden på tingen pluss det som står oppå den.
export function shelfStartFor(boxes: StorageBox[], tapped: Slot, shape: Shape, tower: number, exceptId?: string): Slot | null {
  if (tower > clearance(tapped.level) + 0.001) return null
  const span = spanOf(shape)
  for (let start = tapped.slot; start > tapped.slot - span; start--) {
    if (start < 1 || start + span - 1 > SLOTS.length) continue
    let free = true
    for (let s = start; s < start + span; s++) {
      if (boxInSlot(boxes, { ...tapped, slot: s }, exceptId)) free = false
    }
    if (free) return { ...tapped, slot: start }
  }
  return null
}

// ---------- Stabling ----------

export const baseOf = (boxes: StorageBox[], box: StorageBox) =>
  box.placement === 'stacked' && box.stack_on ? boxes.find(b => b.id === box.stack_on) ?? null : null

export const childOf = (boxes: StorageBox[], box: StorageBox) =>
  boxes.find(b => b.placement === 'stacked' && b.stack_on === box.id) ?? null

// Den nederste i stabelen
export function rootOf(boxes: StorageBox[], box: StorageBox): StorageBox {
  let current = box
  for (let i = 0; i < 10; i++) {
    const base = baseOf(boxes, current)
    if (!base) break
    current = base
  }
  return current
}

// Høyden av det som står under boksen
export function heightBelow(boxes: StorageBox[], box: StorageBox): number {
  let height = 0
  let current = baseOf(boxes, box)
  for (let i = 0; current && i < 10; i++) {
    height += heightOf(current)
    current = baseOf(boxes, current)
  }
  return height
}

// Høyden av boksen og alt som står oppå den
export function towerHeight(boxes: StorageBox[], box: StorageBox, shape: Shape = box): number {
  let height = heightOf(shape)
  let current = childOf(boxes, box)
  for (let i = 0; current && i < 10; i++) {
    height += heightOf(current)
    current = childOf(boxes, current)
  }
  return height
}

// Om «other» står oppå «box» (direkte eller lenger opp i stabelen)
function isAbove(boxes: StorageBox[], other: StorageBox, box: StorageBox): boolean {
  let current = childOf(boxes, box)
  for (let i = 0; current && i < 10; i++) {
    if (current.id === other.id) return true
    current = childOf(boxes, current)
  }
  return false
}

// Grunnen til at noe ikke kan settes oppå «base», eller null hvis det går fint
export function stackProblem(boxes: StorageBox[], mover: StorageBox | null, shape: Shape, tower: number, base: StorageBox): string | null {
  if (base.kind === 'loose' || shape.kind === 'loose') return 'Løse ting kan ikke stables.'
  if (mover && (base.id === mover.id || isAbove(boxes, base, mover))) return 'Den kan ikke stå oppå seg selv.'
  const existing = childOf(boxes, base)
  if (existing && existing.id !== mover?.id) return `Det står allerede noe oppå ${boxName(base)}.`
  const root = rootOf(boxes, base)
  if (root.placement === 'elsewhere') return `${boxName(base)} står ikke i boden.`
  const height = heightBelow(boxes, base) + heightOf(base) + tower
  if (root.placement === 'shelf') {
    if (spanOf(shape) > spanOf(base)) return `Den er for bred til å stå oppå ${boxName(base)} i hylla.`
    if (height > clearance(root.level ?? 1) + 0.001) return 'Det er ikke høyt nok under hylleplaten over.'
  } else if (height > FLOOR_GAP) {
    return 'Stabelen blir for høy.'
  }
  return null
}

export function nextFreeNumber(boxes: StorageBox[]): number {
  const used = new Set(boxes.map(b => b.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

// Fyller inn felt som mangler i rader fra før databasen ble utvidet
export function withDefaults(box: Partial<StorageBox> & Pick<StorageBox, 'id'>): StorageBox {
  return {
    kind: 'box',
    number: null,
    label: '',
    color: 'clear',
    placement: 'floor',
    shelf: null,
    level: null,
    slot: null,
    pos_x: null,
    pos_z: null,
    rotation: 0,
    location: '',
    created_at: new Date().toISOString(),
    ...box,
    size: box.size ?? 'normal',
    stack_on: box.stack_on ?? null,
  }
}

// ---------- Demo ----------

type SeedContainer = {
  kind: ContainerKind
  number: number | null
  label: string
  color: string
  placement: Placement
  shelf?: ShelfId
  level?: number
  slot?: number
  pos_x?: number
  pos_z?: number
  rotation?: number
  location?: string
  items: string[]
}

export const SEED = seed.containers as SeedContainer[]

// Samme innhold som startdataene i supabase/bod.sql, brukt før tabellene finnes
export function createDemoData(): { boxes: StorageBox[]; items: StorageItem[] } {
  const start = Date.now()
  const boxes: StorageBox[] = []
  const items: StorageItem[] = []
  let counter = 0

  SEED.forEach((container, index) => {
    const id = `demo-box-${index + 1}`
    boxes.push(
      withDefaults({
        id,
        kind: container.kind,
        number: container.number,
        label: container.label,
        color: container.color,
        placement: container.placement,
        shelf: container.shelf ?? null,
        level: container.level ?? null,
        slot: container.slot ?? null,
        pos_x: container.pos_x ?? null,
        pos_z: container.pos_z ?? null,
        rotation: container.rotation ?? 0,
        location: container.location ?? '',
        created_at: new Date(start).toISOString(),
      })
    )
    for (const name of container.items) {
      counter++
      items.push({ id: `demo-item-${counter}`, box_id: id, name, created_at: new Date(start + counter).toISOString() })
    }
  })

  return { boxes, items }
}

// ---------- Søk ----------

export function normalize(text: string): string {
  return text.toLocaleLowerCase('nb-NO').trim()
}

export type SearchHit = { box: StorageBox; items: StorageItem[]; boxMatch: boolean }

export function searchBoxes(query: string, boxes: StorageBox[], items: StorageItem[]): SearchHit[] {
  const q = normalize(query.replace(/^boks\s*/i, ''))
  if (!q) return []

  return boxes
    .map(box => {
      const boxMatch =
        String(box.number) === q ||
        normalize(boxName(box)).includes(q) ||
        (box.label !== '' && normalize(box.label).includes(q)) ||
        (box.location !== '' && normalize(box.location).includes(q))
      const matched = items.filter(item => item.box_id === box.id && normalize(item.name).includes(q))
      return { box, items: matched, boxMatch }
    })
    .filter(hit => hit.boxMatch || hit.items.length > 0)
    .sort((a, b) => (a.box.number ?? 1000) - (b.box.number ?? 1000))
}
