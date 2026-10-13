'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuid } from 'uuid'
import { supabase } from '@/lib/supabase'
import AppSwitcher from '@/components/AppSwitcher'
import BoxSheet from '@/components/bod/BoxSheet'
import ShelfMap from '@/components/bod/ShelfMap'
import ContainerDialog, { type ContainerDraft } from '@/components/bod/ContainerDialog'
import EditPanel, { EDIT_PANEL } from '@/components/bod/EditPanel'
import type { Insets, Preset } from '@/components/bod/StorageScene'
import {
  KINDS,
  baseOf,
  boxLabelSuffix,
  boxName,
  childOf,
  clearance,
  createDemoData,
  describePlacement,
  describeSlot,
  heightOf,
  nextFreeNumber,
  rootOf,
  searchBoxes,
  shelfStartFor,
  slotOf,
  spanOf,
  stackProblem,
  towerHeight,
  withDefaults,
  type Slot,
  type StorageBox,
  type StorageItem,
} from '@/lib/storage'

const StorageScene = dynamic(() => import('@/components/bod/StorageScene'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">Bygger boden …</div>
  ),
})

const PRESETS: { id: Preset; icon: string; label: string }[] = [
  { id: 'overview', icon: '🏠', label: 'Oversikt' },
  { id: 'A', icon: '🅰️', label: 'Hylle A' },
  { id: 'B', icon: '🅱️', label: 'Hylle B' },
]

const HINT_KEY = 'bod-hint-v2'
const WIDE_PANEL = 400
const NAV_SPACE = 84
const DEFAULT_FLOOR = { x: 0.95, z: 2 }

type Status = 'loading' | 'ready' | 'demo' | 'error'
type Toast = { message: string; undo?: () => void }
type PlacementFields = Pick<StorageBox, 'placement' | 'shelf' | 'level' | 'slot' | 'pos_x' | 'pos_z' | 'stack_on'>
type AddTarget = { kind: 'slot'; slot: Slot } | { kind: 'floor'; x: number; z: number } | { kind: 'any' }
type Dialog = { mode: 'add'; target: AddTarget } | { mode: 'edit'; boxId: string }

const round = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const EMPTY_PLACEMENT = { shelf: null, level: null, slot: null, pos_x: null, pos_z: null, stack_on: null }
const shelfFields = (slot: Slot): PlacementFields => ({ ...EMPTY_PLACEMENT, placement: 'shelf', shelf: slot.shelf, level: slot.level, slot: slot.slot })
const floorFields = (x: number, z: number): PlacementFields => ({ ...EMPTY_PLACEMENT, placement: 'floor', pos_x: round(x), pos_z: round(z) })
const stackedFields = (baseId: string): PlacementFields => ({ ...EMPTY_PLACEMENT, placement: 'stacked', stack_on: baseId })
const elsewhereFields: PlacementFields = { ...EMPTY_PLACEMENT, placement: 'elsewhere' }
const placementOf = (box: StorageBox): PlacementFields => ({
  placement: box.placement,
  shelf: box.shelf,
  level: box.level,
  slot: box.slot,
  pos_x: box.pos_x,
  pos_z: box.pos_z,
  stack_on: box.stack_on,
})

// Første ledige plass på gulvet (minst ca. en halv meter fra det som står der fra før)
function freeFloorSpot(boxes: StorageBox[]) {
  const taken = boxes.filter(b => b.placement === 'floor' && b.pos_x != null && b.pos_z != null)
  for (const z of [1.6, 2.0, 2.4, 2.7]) {
    for (const x of [0.95, 0.6, 1.25, 0.3]) {
      if (taken.every(b => Math.hypot(b.pos_x! - x, b.pos_z! - z) > 0.55)) return { x, z }
    }
  }
  return DEFAULT_FLOOR
}

const freeFloorFields = (boxes: StorageBox[]) => {
  const spot = freeFloorSpot(boxes)
  return floorFields(spot.x, spot.z)
}

function isMissingTable(error: { code?: string }) {
  return error.code === 'PGRST205' || error.code === '42P01'
}

// Grunnen til at to ting ikke kan bytte plass, eller null hvis det går fint
function swapProblem(boxes: StorageBox[], a: StorageBox, b: StorageBox): string | null {
  if (a.placement === 'floor' && b.placement === 'floor') return null
  const slotA = slotOf(a)
  const slotB = slotOf(b)
  if (!slotA || !slotB) return 'Bytte plass går bare mellom to ting i hyllene eller to ting på gulvet.'
  if (spanOf(a) !== spanOf(b)) return 'De tar ikke like mange plasser i hylla.'
  if (towerHeight(boxes, a) > clearance(slotB.level) + 0.001 || towerHeight(boxes, b) > clearance(slotA.level) + 0.001) {
    return 'En av dem er for høy til den andre plassen.'
  }
  return null
}

// Hvorfor noe ikke får plass på en ledig hylleplass
function slotProblem(boxes: StorageBox[], box: StorageBox, slot: Slot): string {
  if (towerHeight(boxes, box) > clearance(slot.level) + 0.001) {
    return slot.level === 4 ? 'På toppen av hylla er det bare plass til lave ting.' : 'Det er ikke høyt nok her.'
  }
  return spanOf(box) > 1 ? 'Den tar to plasser, og det er ikke to ledige plasser ved siden av hverandre her.' : 'Plassen er opptatt.'
}

function MoveChoice({ mover, target, swapReason, stackReason, onSwap, onStack, onCancel }: {
  mover: StorageBox
  target: StorageBox
  swapReason: string | null
  stackReason: string | null
  onSwap: () => void
  onStack: () => void
  onCancel: () => void
}) {
  const option = (label: string, reason: string | null, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={reason !== null}
      className="w-full rounded-xl border border-stone-200 px-4 py-3 text-left font-semibold enabled:hover:bg-amber-50 disabled:opacity-50"
    >
      {label}
      {reason && <span className="block text-xs font-normal text-stone-500">{reason}</span>}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] space-y-2"
      >
        <h2 className="text-lg font-extrabold mb-2">
          Flytte {boxName(mover)} til {boxName(target)}?
        </h2>
        {option(`↔ Bytt plass med ${boxName(target)}`, swapReason, onSwap)}
        {option(`⬆ Sett oppå ${boxName(target)}`, stackReason, onStack)}
        <button onClick={onCancel} className="w-full rounded-xl bg-stone-100 py-2.5 font-semibold text-stone-700">
          Avbryt
        </button>
      </div>
    </div>
  )
}

export default function BodPage() {
  const [boxes, setBoxes] = useState<StorageBox[]>([])
  const [items, setItems] = useState<StorageItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [preset, setPreset] = useState<Preset>('overview')
  const [presetNonce, setPresetNonce] = useState(0)
  const [map, setMap] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editSelectedId, setEditSelectedId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [choiceTargetId, setChoiceTargetId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [showHint, setShowHint] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const demo = status === 'demo'
  const live = status === 'ready'

  const load = useCallback(async () => {
    // ?demo i adressen viser eksempeldata uten å røre databasen (nyttig for å teste)
    if (new URLSearchParams(window.location.search).has('demo')) {
      const data = createDemoData()
      setBoxes(data.boxes)
      setItems(data.items)
      setStatus('demo')
      return
    }
    const [boxResult, itemResult] = await Promise.all([
      supabase.from('storage_boxes').select('*').order('number', { nullsFirst: false }),
      supabase.from('storage_items').select('*').order('created_at'),
    ])
    const error = boxResult.error ?? itemResult.error
    if (error) {
      if (isMissingTable(error)) {
        const data = createDemoData()
        setBoxes(data.boxes)
        setItems(data.items)
        setStatus('demo')
      } else {
        console.error(error)
        setStatus(current => (current === 'loading' ? 'error' : current))
      }
      return
    }
    setBoxes((boxResult.data ?? []).map(withDefaults))
    setItems(itemResult.data ?? [])
    setStatus('ready')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Sanntid: endringer fra andre mobiler, og oppdatering når appen kommer i fokus igjen
  useEffect(() => {
    if (!live) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(load, 250)
    }
    const channel = supabase
      .channel('bod-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'storage_boxes' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'storage_items' }, reload)
      .subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, load])

  useEffect(() => {
    const element = areaRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [status])

  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_KEY)) setShowHint(true)
    } catch {
      setShowHint(true)
    }
  }, [])

  const dismissHint = () => {
    setShowHint(false)
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {}
  }

  const showToast = (message: string, undo?: () => void) => {
    clearTimeout(toastTimer.current)
    setToast({ message, undo })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  const reportError = (error: unknown) => {
    console.error(error)
    showToast('Kunne ikke lagre endringen. Sjekk nettet og prøv igjen.')
    load()
  }

  const persist = async (request: PromiseLike<{ error: unknown }>) => {
    const { error } = await request
    if (error) reportError(error)
  }

  // ---------- Ting i boksene (vises med en gang, lagres i bakgrunnen) ----------

  const addItem = (boxId: string, name: string) => {
    const item: StorageItem = { id: uuid(), box_id: boxId, name, created_at: new Date().toISOString() }
    setItems(prev => [...prev, item])
    if (!demo) persist(supabase.from('storage_items').insert(item))
  }

  const restoreItem = (item: StorageItem) => {
    setItems(prev => (prev.some(i => i.id === item.id) ? prev : [...prev, item]))
    setToast(null)
    if (!demo) persist(supabase.from('storage_items').insert(item))
  }

  const removeItem = (item: StorageItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    showToast(`Tok ut «${item.name}»`, () => restoreItem(item))
    if (!demo) persist(supabase.from('storage_items').delete().eq('id', item.id))
  }

  const renameItem = (item: StorageItem, name: string) => {
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, name } : i)))
    if (!demo) persist(supabase.from('storage_items').update({ name }).eq('id', item.id))
  }

  // ---------- Bokser, kofferter osv. ----------

  const createBox = (fields: Omit<StorageBox, 'id' | 'created_at'>) => {
    const box: StorageBox = { ...fields, id: uuid(), created_at: new Date().toISOString() }
    setBoxes(prev => [...prev, box])
    if (!demo) persist(supabase.from('storage_boxes').insert(box))
    return box
  }

  const updateBox = (box: StorageBox, changes: Partial<Omit<StorageBox, 'id' | 'created_at'>>) => {
    setBoxes(prev => prev.map(b => (b.id === box.id ? { ...b, ...changes } : b)))
    if (!demo) persist(supabase.from('storage_boxes').update(changes).eq('id', box.id))
  }

  // Det som står oppå blir med når noe flyttes
  const placeBox = (box: StorageBox, target: PlacementFields, message: string) => {
    setBoxes(prev => prev.map(b => (b.id === box.id ? { ...b, ...target } : b)))
    showToast(message)
    if (!demo) persist(supabase.from('storage_boxes').update(target).eq('id', box.id))
  }

  const swapBoxes = (a: StorageBox, b: StorageBox) => {
    const placeA = placementOf(a)
    const placeB = placementOf(b)
    setBoxes(prev => prev.map(x => (x.id === a.id ? { ...x, ...placeB } : x.id === b.id ? { ...x, ...placeA } : x)))
    showToast(`${boxName(a)} og ${boxName(b)} har byttet plass`)
    if (demo) return
    persist(supabase.from('storage_boxes').update(placeB).eq('id', a.id))
    persist(supabase.from('storage_boxes').update(placeA).eq('id', b.id))
  }

  const restoreBox = async (box: StorageBox, boxItems: StorageItem[], child: StorageBox | null) => {
    setBoxes(prev => {
      const restored = prev.some(b => b.id === box.id) ? prev : [...prev, box]
      return child ? restored.map(b => (b.id === child.id ? { ...b, ...stackedFields(box.id) } : b)) : restored
    })
    setItems(prev => [...prev.filter(i => i.box_id !== box.id), ...boxItems])
    setToast(null)
    if (demo) return
    const { error } = await supabase.from('storage_boxes').insert(box)
    if (error) return reportError(error)
    if (boxItems.length > 0) persist(supabase.from('storage_items').insert(boxItems))
    if (child) persist(supabase.from('storage_boxes').update(stackedFields(box.id)).eq('id', child.id))
  }

  // Det som stod oppå havner der boksen stod
  const removeBox = (box: StorageBox) => {
    const boxItems = items.filter(i => i.box_id === box.id)
    if (boxItems.length > 0 && !window.confirm(`Fjerne ${boxName(box)} og alt som ligger i den (${boxItems.length} ting)?`)) return
    const child = childOf(boxes, box)
    const from = placementOf(box)
    setBoxes(prev => prev.filter(b => b.id !== box.id).map(b => (child && b.id === child.id ? { ...b, ...from } : b)))
    setItems(prev => prev.filter(i => i.box_id !== box.id))
    if (selectedId === box.id) setSelectedId(null)
    if (editSelectedId === box.id) {
      setEditSelectedId(null)
      setMoving(false)
    }
    showToast(`${boxName(box)} er fjernet`, () => restoreBox(box, boxItems, child))
    if (demo) return
    ;(async () => {
      if (child) {
        const { error } = await supabase.from('storage_boxes').update(from).eq('id', child.id)
        if (error) return reportError(error)
      }
      persist(supabase.from('storage_boxes').delete().eq('id', box.id))
    })()
  }

  // ---------- Avledet tilstand ----------

  const selectedBox = boxes.find(b => b.id === selectedId) ?? null
  const editSelected = boxes.find(b => b.id === editSelectedId) ?? null
  const hits = useMemo(() => searchBoxes(query, boxes, items), [query, boxes, items])
  const highlightIds = useMemo(() => new Set(hits.map(hit => hit.box.id)), [hits])
  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.box_id, (counts.get(item.box_id) ?? 0) + 1)
    return counts
  }, [items])
  const selectedItems = useMemo(
    () =>
      items
        .filter(item => item.box_id === selectedId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
            a.name.localeCompare(b.name, 'nb', { numeric: true })
        ),
    [items, selectedId]
  )
  const takenNumbers = (exceptId: string | null) =>
    new Set(boxes.filter(b => b.id !== exceptId && b.number != null).map(b => b.number as number))

  const wide = area.width >= 768
  const sheetHeight = Math.round(area.height * 0.5)
  // Hvor mye av 3D-visningen som er dekket av panelene, så bildet kan flyttes unna
  const insetBottom = selectedBox ? (wide ? 0 : sheetHeight) : editMode ? (wide ? 0 : EDIT_PANEL.height) : NAV_SPACE
  const insetRight = selectedBox ? (wide ? WIDE_PANEL : 0) : editMode && wide ? EDIT_PANEL.width : 0
  const insets = useMemo<Insets>(() => ({ bottom: insetBottom, right: insetRight }), [insetBottom, insetRight])

  // ---------- Handlinger ----------

  const openBox = (id: string) => {
    setSelectedId(id)
    setSearchOpen(false)
    searchRef.current?.blur()
    if (showHint) dismissHint()
  }

  const choosePreset = (id: Preset) => {
    setPreset(id)
    setPresetNonce(n => n + 1)
  }

  const enterEdit = (selectId: string | null = null, startMoving = false) => {
    setSelectedId(null)
    setSearchOpen(false)
    setEditMode(true)
    setEditSelectedId(selectId)
    setMoving(startMoving && selectId !== null)
    setPresetNonce(n => n + 1)
    if (showHint) dismissHint()
  }

  const exitEdit = () => {
    setEditMode(false)
    setEditSelectedId(null)
    setMoving(false)
    setMap(false)
    setPresetNonce(n => n + 1)
  }

  // Ferdig med en flytting: ingenting er valgt lenger
  const finishMove = () => {
    setMoving(false)
    setEditSelectedId(null)
    setChoiceTargetId(null)
  }

  // I redigeringsmodus velger et trykk bare boksen. Flytting skjer først etter «Flytt».
  const handleBoxClick = (id: string) => {
    if (!editMode) {
      openBox(id)
      return
    }
    if (moving && editSelected) {
      if (id === editSelected.id) setMoving(false)
      else setChoiceTargetId(id)
      return
    }
    setEditSelectedId(editSelectedId === id ? null : id)
  }

  const handleSlotClick = (slot: Slot) => {
    if (!editMode) return
    if (moving && editSelected) {
      const start = shelfStartFor(boxes, slot, editSelected, towerHeight(boxes, editSelected), editSelected.id)
      if (!start) {
        showToast(slotProblem(boxes, editSelected, slot))
        return
      }
      placeBox(editSelected, shelfFields(start), `${boxName(editSelected)} er flyttet`)
      finishMove()
      return
    }
    setEditSelectedId(null)
    setDialog({ mode: 'add', target: { kind: 'slot', slot } })
  }

  const handleFloorClick = ({ x, z }: { x: number; z: number }) => {
    if (!editMode) {
      if (selectedId) setSelectedId(null)
      return
    }
    if (moving && editSelected) {
      placeBox(editSelected, floorFields(clamp(x, 0.2, 1.8), clamp(z, 0.2, 2.8)), `${boxName(editSelected)} er flyttet`)
      finishMove()
      return
    }
    setEditSelectedId(null)
  }

  const handleBackgroundClick = () => {
    if (editMode) {
      if (!moving) setEditSelectedId(null)
    } else if (selectedId) {
      setSelectedId(null)
    }
  }

  const saveDialog = (draft: ContainerDraft, elsewhere: boolean) => {
    if (!dialog) return
    if (dialog.mode === 'add') {
      const target = dialog.target
      const start = target.kind === 'slot' ? shelfStartFor(boxes, target.slot, draft, heightOf(draft)) : null
      const placement = elsewhere
        ? elsewhereFields
        : start
          ? shelfFields(start)
          : target.kind === 'floor'
            ? floorFields(target.x, target.z)
            : freeFloorFields(boxes)
      const box = createBox({ ...draft, ...placement, rotation: 0 })
      if (target.kind === 'any' && !elsewhere) {
        // Nytt på gulvet: velg det og la brukeren trykke der det skal stå
        setEditSelectedId(box.id)
        setMoving(true)
        showToast(`${boxName(box)} er lagt til. Trykk der den skal stå.`)
      } else {
        setEditSelectedId(null)
        showToast(`${boxName(box)} er lagt til`)
      }
    } else {
      const box = boxes.find(b => b.id === dialog.boxId)
      if (box) {
        const slot = slotOf(box)
        const shapeChanged = draft.kind !== box.kind || draft.size !== box.size
        const start = slot && shapeChanged ? shelfStartFor(boxes, slot, draft, towerHeight(boxes, box, draft), box.id) : null
        const placement: Partial<PlacementFields> =
          elsewhere && box.placement !== 'elsewhere'
            ? elsewhereFields
            : !elsewhere && box.placement === 'elsewhere'
              ? freeFloorFields(boxes)
              : start
                ? shelfFields(start)
                : {}
        updateBox(box, { ...draft, ...placement })
      }
    }
    setDialog(null)
  }

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 bg-stone-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📦</div>
          <p className="text-stone-400">Laster boden …</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="fixed inset-0 bg-stone-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-stone-900 rounded-2xl p-6 text-center text-stone-200">
          <div className="text-5xl mb-3">📡</div>
          <h1 className="font-bold text-lg mb-1">Fikk ikke kontakt med databasen</h1>
          <p className="text-sm text-stone-400 mb-5">Sjekk at du er på nett, og prøv igjen.</p>
          <button onClick={() => { setStatus('loading'); load() }} className="px-5 py-2.5 rounded-xl bg-amber-400 text-stone-900 font-semibold">
            Prøv igjen
          </button>
          <div className="mt-4">
            <AppSwitcher active="bod" dark />
          </div>
        </div>
      </div>
    )
  }

  const dialogElement = (() => {
    if (!dialog) return null
    if (dialog.mode === 'add') {
      const target = dialog.target
      const slot = target.kind === 'slot' ? target.slot : null
      return (
        <ContainerDialog
          title="Legg til i boden"
          initial={{
            kind: slot ? 'box' : 'suitcase',
            size: slot?.level === 4 ? 'low' : 'normal',
            number: slot ? nextFreeNumber(boxes) : null,
            label: '',
            color: slot ? 'clear' : 'black',
            location: '',
          }}
          hereText={slot ? describeSlot(slot) : target.kind === 'floor' ? 'På gulvet der du trykket' : 'På gulvet'}
          placeNote={
            slot
              ? slot.level === 4
                ? 'På toppen av hylla er det bare plass til lave ting.'
                : 'Noe er sperret fordi det ikke får plass her. En koffert og en lav, lang boks tar to plasser.'
              : undefined
          }
          canPlaceInBod={shape => !slot || shelfStartFor(boxes, slot, shape, heightOf(shape)) !== null}
          startElsewhere={false}
          takenNumbers={takenNumbers(null)}
          submitLabel="Legg til"
          onSave={saveDialog}
          onCancel={() => setDialog(null)}
        />
      )
    }
    const box = boxes.find(b => b.id === dialog.boxId)
    if (!box) return null
    const slot = slotOf(box)
    const base = baseOf(boxes, box)
    return (
      <ContainerDialog
        key={box.id}
        title={`Endre ${boxName(box)}`}
        initial={{ kind: box.kind, size: box.size, number: box.number, label: box.label, color: box.color, location: box.location }}
        hereText={box.placement === 'elsewhere' ? 'Settes på gulvet' : describePlacement(box, boxes)}
        placeNote={slot ? 'Noe er sperret fordi det ikke får plass der den står nå.' : base ? `Noe er sperret fordi det ikke får plass oppå ${boxName(base)}.` : undefined}
        canPlaceInBod={shape =>
          slot
            ? shelfStartFor(boxes, slot, shape, towerHeight(boxes, box, shape), box.id) !== null
            : base
              ? stackProblem(boxes, box, shape, towerHeight(boxes, box, shape), base) === null
              : true
        }
        startElsewhere={box.placement === 'elsewhere'}
        takenNumbers={takenNumbers(box.id)}
        submitLabel="Lagre"
        onSave={saveDialog}
        onDelete={() => {
          setDialog(null)
          removeBox(box)
        }}
        onCancel={() => setDialog(null)}
      />
    )
  })()

  const choiceElement = (() => {
    const target = boxes.find(b => b.id === choiceTargetId)
    if (!target || !editSelected) return null
    return (
      <MoveChoice
        mover={editSelected}
        target={target}
        swapReason={swapProblem(boxes, editSelected, target)}
        stackReason={stackProblem(boxes, editSelected, editSelected, towerHeight(boxes, editSelected), target)}
        onSwap={() => {
          swapBoxes(editSelected, target)
          finishMove()
        }}
        onStack={() => {
          placeBox(editSelected, stackedFields(target.id), `${boxName(editSelected)} står nå oppå ${boxName(target)}`)
          finishMove()
        }}
        onCancel={() => setChoiceTargetId(null)}
      />
    )
  })()

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-950 text-white overscroll-none">
      <header className="relative z-20 bg-stone-900 border-b border-white/10 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <h1 className="sr-only">Boden</h1>
            <AppSwitcher active="bod" dark />
            <span className="text-xs text-stone-400">
              {boxes.filter(b => b.kind === 'box').length} bokser · {items.length} ting
            </span>
          </div>

          <div className="relative mt-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Søk etter ting eller boks"
              enterKeyHint="search"
              className="w-full rounded-xl bg-white/10 pl-10 pr-10 py-2.5 text-[16px] text-white placeholder:text-stone-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-400 [&::-webkit-search-cancel-button]:hidden"
            />
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
            {query && (
              <button
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                aria-label="Tøm søket"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 text-stone-300 text-sm"
              >
                ✕
              </button>
            )}

            {searchOpen && query.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 max-h-[55vh] overflow-y-auto rounded-2xl bg-white text-stone-900 shadow-2xl">
                {hits.length === 0 ? (
                  <p className="p-4 text-sm text-stone-500">Fant ingenting som heter «{query.trim()}».</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {hits.map(hit => (
                      <li key={hit.box.id}>
                        <button onClick={() => openBox(hit.box.id)} className="w-full text-left px-4 py-3 hover:bg-amber-50">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-extrabold">
                              {hit.box.kind !== 'box' && <span className="mr-1">{KINDS[hit.box.kind].icon}</span>}
                              {boxName(hit.box)}
                              {boxLabelSuffix(hit.box) && <span className="font-semibold text-stone-500"> · {boxLabelSuffix(hit.box)}</span>}
                            </span>
                            <span className="text-xs text-stone-400 text-right">{describePlacement(hit.box, boxes)}</span>
                          </div>
                          {hit.items.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {hit.items.slice(0, 6).map(item => (
                                <span key={item.id} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  {item.name}
                                </span>
                              ))}
                              {hit.items.length > 6 && <span className="text-xs text-stone-400">+{hit.items.length - 6} til</span>}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main ref={areaRef} className="relative flex-1 overflow-hidden">
        <StorageScene
          boxes={boxes}
          items={items}
          openId={selectedId}
          highlightIds={highlightIds}
          editMode={editMode}
          editSelectedId={editSelectedId}
          preset={preset}
          presetNonce={presetNonce}
          insets={insets}
          onBoxClick={handleBoxClick}
          onSlotClick={handleSlotClick}
          onFloorClick={handleFloorClick}
          onBackgroundClick={handleBackgroundClick}
        />

        {demo && !selectedBox && !editMode && (
          <div className="absolute top-3 left-3 right-3 z-10 mx-auto max-w-md rounded-xl bg-amber-400/95 px-3 py-2 text-xs text-stone-900 shadow-lg">
            <strong>Demo</strong> – eksempeldata, endringer lagres ikke.
          </div>
        )}

        {showHint && !selectedBox && !editMode && (
          <div className={`absolute left-3 right-3 z-10 mx-auto max-w-sm rounded-2xl bg-stone-900/90 p-4 text-sm text-stone-200 shadow-xl backdrop-blur ${demo ? 'top-14' : 'top-3'}`}>
            <p className="font-semibold text-white mb-1.5">Slik bruker du boden</p>
            <ul className="space-y-1 text-stone-300">
              <li>👆 Dra for å snu rommet, knip for å zoome</li>
              <li>📦 Trykk på en boks for å åpne den</li>
              <li>✏️ Trykk «Rediger» for å endre, flytte, legge til eller fjerne</li>
            </ul>
            <button onClick={dismissHint} className="mt-3 w-full rounded-xl bg-amber-400 py-2 font-semibold text-stone-900">
              Skjønner
            </button>
          </div>
        )}

        {!selectedBox && !editMode && (
          <nav className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
            <div className="pointer-events-auto flex gap-1 rounded-2xl bg-stone-900/85 p-1.5 shadow-xl backdrop-blur">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  className={`flex w-[62px] flex-col items-center rounded-xl py-1.5 text-[11px] font-semibold ${
                    preset === p.id ? 'bg-amber-400 text-stone-900' : 'text-stone-200 hover:bg-white/10'
                  }`}
                >
                  <span className="text-lg leading-none">{p.icon}</span>
                  <span className="mt-1">{p.label}</span>
                </button>
              ))}
              <button
                onClick={() => setMap(true)}
                className="flex w-[62px] flex-col items-center rounded-xl py-1.5 text-[11px] font-semibold text-stone-200 hover:bg-white/10"
              >
                <span className="text-lg leading-none">🗺️</span>
                <span className="mt-1">Kart</span>
              </button>
              <button
                onClick={() => enterEdit()}
                className="flex w-[62px] flex-col items-center rounded-xl py-1.5 text-[11px] font-semibold text-stone-200 hover:bg-white/10"
              >
                <span className="text-lg leading-none">✏️</span>
                <span className="mt-1">Rediger</span>
              </button>
            </div>
          </nav>
        )}

        {editMode && (
          <EditPanel
            wide={wide}
            selected={editSelected}
            moving={moving}
            canRotate={editSelected !== null && rootOf(boxes, editSelected).placement === 'floor'}
            onDone={exitEdit}
            onAdd={() => setDialog({ mode: 'add', target: { kind: 'any' } })}
            onMap={() => setMap(true)}
            onEdit={() => editSelected && setDialog({ mode: 'edit', boxId: editSelected.id })}
            onMove={() => setMoving(true)}
            onCancelMove={() => setMoving(false)}
            onRotate={() => editSelected && updateBox(editSelected, { rotation: (editSelected.rotation + 90) % 360 })}
            onRemove={() => editSelected && removeBox(editSelected)}
            onDeselect={() => setEditSelectedId(null)}
          />
        )}

        {toast && (
          <div
            className={`absolute left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-stone-800 px-4 py-2.5 text-sm text-white shadow-xl max-w-[92%] ${
              (selectedBox && !wide) || editMode ? 'top-3' : 'bottom-24'
            }`}
          >
            <span className="truncate">{toast.message}</span>
            {toast.undo && (
              <button onClick={toast.undo} className="flex-shrink-0 font-semibold text-amber-300">
                Angre
              </button>
            )}
          </div>
        )}

        {selectedBox && (
          <BoxSheet
            box={selectedBox}
            items={selectedItems}
            placementText={describePlacement(selectedBox, boxes)}
            query={query}
            wide={wide}
            height={sheetHeight}
            onClose={() => setSelectedId(null)}
            onAddItem={name => addItem(selectedBox.id, name)}
            onRemoveItem={removeItem}
            onRenameItem={renameItem}
            onEdit={() => setDialog({ mode: 'edit', boxId: selectedBox.id })}
            onMove={() => enterEdit(selectedBox.id, true)}
          />
        )}
      </main>

      {map && (
        <ShelfMap
          boxes={boxes}
          itemCounts={itemCounts}
          highlightIds={highlightIds}
          editMode={editMode}
          selectedId={editSelectedId}
          moving={moving}
          onClose={() => setMap(false)}
          onPickSlot={handleSlotClick}
          onPickBox={box => {
            if (editMode) {
              handleBoxClick(box.id)
            } else {
              setMap(false)
              openBox(box.id)
            }
          }}
        />
      )}

      {dialogElement}
      {choiceElement}
    </div>
  )
}
