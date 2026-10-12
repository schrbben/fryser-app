import seed from './bodSeed.json'

export type ShelfId = 'A' | 'B'
export type ContainerKind = 'box' | 'bin' | 'suitcase' | 'cardboard' | 'loose'
export type Placement = 'shelf' | 'floor' | 'elsewhere'

// En "boks" er alt som kan inneholde ting: plastbokser, kofferter, pappbokser og løse ting på gulvet
export type StorageBox = {
  id: string
  kind: ContainerKind
  number: number | null // nummeret på lappen (plastboksene)
  label: string
  color: string
  placement: Placement
  shelf: ShelfId | null
  level: number | null // 1 = nederst, 3 = øverst
  slot: number | null // 1 = lengst til venstre når man står foran hylla
  pos_x: number | null // meter fra venstre vegg (på gulvet)
  pos_z: number | null // meter fra innerste vegg (på gulvet)
  rotation: number // grader (på gulvet)
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

export const SHELVES: ShelfId[] = ['A', 'B']
export const LEVELS_TOP_DOWN = [3, 2, 1]
export const SLOTS = [1, 2, 3, 4]

export const SHELF_NAMES: Record<ShelfId, string> = {
  A: 'Hylle A · innerst',
  B: 'Hylle B · høyre vegg',
}

export const LEVEL_NAMES: Record<number, string> = {
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

// span = hvor mange plasser i hylla den tar
export const KINDS: Record<ContainerKind, { name: string; icon: string; colors: string[]; span: number }> = {
  box: { name: 'Plastboks', icon: '📦', colors: ['clear', 'black', 'white'], span: 1 },
  suitcase: { name: 'Koffert', icon: '🧳', colors: ['black', 'gray', 'blue', 'red', 'green', 'purple'], span: 2 },
  cardboard: { name: 'Pappboks', icon: '🟫', colors: ['brown'], span: 1 },
  bin: { name: 'Annen boks', icon: '🗃️', colors: ['purple', 'blue', 'orange', 'green', 'red', 'gray', 'white', 'black'], span: 1 },
  loose: { name: 'Løse ting', icon: '🧺', colors: ['gray'], span: 1 },
}

export const slotSpan = (kind: ContainerKind) => KINDS[kind].span

export const KIND_ORDER: ContainerKind[] = ['box', 'suitcase', 'cardboard', 'bin', 'loose']

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

export function describePlacement(box: StorageBox): string {
  const slot = slotOf(box)
  if (slot) return describeSlot(slot, slotSpan(box.kind))
  if (box.placement === 'floor') return 'På gulvet i boden'
  return box.location ? `Utenfor boden · ${box.location}` : 'Utenfor boden'
}

// Boksen som dekker plassen (en koffert dekker også plassen til høyre for seg)
export function boxInSlot(boxes: StorageBox[], slot: Slot, exceptId?: string): StorageBox | null {
  return boxes.find(box => {
    if (box.id === exceptId) return false
    const s = slotOf(box)
    return s !== null && s.shelf === slot.shelf && s.level === slot.level && slot.slot >= s.slot && slot.slot < s.slot + slotSpan(box.kind)
  }) ?? null
}

// Første plass der noe med gitt bredde kan stå og samtidig dekke plassen man trykket på
export function shelfStartFor(boxes: StorageBox[], tapped: Slot, span: number, exceptId?: string): Slot | null {
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

export function nextFreeNumber(boxes: StorageBox[]): number {
  const used = new Set(boxes.map(b => b.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

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
    boxes.push({
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
    for (const name of container.items) {
      counter++
      items.push({ id: `demo-item-${counter}`, box_id: id, name, created_at: new Date(start + counter).toISOString() })
    }
  })

  return { boxes, items }
}

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
