'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import AppSwitcher from '@/components/AppSwitcher'
import ArchiveSheet from '@/components/rydding/ArchiveSheet'
import ChoreEditor, { type ChoreDraft } from '@/components/rydding/ChoreEditor'
import ChoreRow from '@/components/rydding/ChoreRow'
import ChoreSheet from '@/components/rydding/ChoreSheet'
import DoneDateSheet from '@/components/rydding/DoneDateSheet'
import LastDoneSheet from '@/components/rydding/LastDoneSheet'
import RoomsSheet from '@/components/rydding/RoomsSheet'
import SettingsSheet from '@/components/rydding/SettingsSheet'
import TimeSheet from '@/components/rydding/TimeSheet'
import { STATUS_STYLE, capitalize, mins } from '@/components/rydding/styles'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_SETTINGS, STATUS_ORDER, WEEKDAYS, addDays, buildPlan, capTodayActive, cleaningDayInMonths, createDemoData,
  intervalText, lastDoneMap, longDate, relativeDay, shortDate, snoozeTarget, spreadInitialDues, todayString,
  type Chore, type ChoreCompletion, type ChoreRoom, type ChoreSettings, type ChoreState, type DateString,
} from '@/lib/rydding'

type Data = { rooms: ChoreRoom[]; chores: Chore[]; completions: ChoreCompletion[]; settings: ChoreSettings }
type LoadStatus = 'loading' | 'ready' | 'error'
type Toast = { message: string; actions?: { label: string; run: () => void }[] }
/** Datovelgeren: `from` er datoen som endres, null = legg til en ny. */
type DatePick = { choreId: string; from: DateString | null }
type EditorState = { mode: 'new'; roomId: string | null } | { mode: 'edit'; choreId: string }

const draftOf = (chore: Chore): ChoreDraft => ({
  name: chore.name,
  room_id: chore.room_id,
  interval_weeks: chore.interval_weeks,
  priority: chore.priority,
  est_minutes: chore.est_minutes,
  fixed_months: chore.fixed_months,
  purchase_item: chore.purchase_item,
  notes: chore.notes,
})

const sameMonths = (a: number[] | null, b: number[] | null) => (a ?? []).join(',') === (b ?? []).join(',')

const EMPTY: Data = { rooms: [], chores: [], completions: [], settings: DEFAULT_SETTINGS }

async function fetchAll<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

async function fetchData(): Promise<Data> {
  const [rooms, chores, completions, settings] = await Promise.all([
    fetchAll<ChoreRoom>('chore_rooms', 'sort_order'),
    fetchAll<Chore>('chores', 'created_at'),
    fetchAll<ChoreCompletion>('chore_completions', 'done_on', false),
    supabase.from('chore_settings').select('*').eq('id', 1).maybeSingle(),
  ])
  if (settings.error) throw settings.error
  return { rooms, chores, completions, settings: { ...DEFAULT_SETTINGS, ...(settings.data ?? {}) } }
}

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function RyddingPage() {
  const [data, setData] = useState<Data>(EMPTY)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [demo, setDemo] = useState(false)
  const [today, setToday] = useState(() => todayString())
  const [roomFilter, setRoomFilter] = useState<string>('all')
  const [intervalFilter, setIntervalFilter] = useState<number | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showLater, setShowLater] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [datePick, setDatePick] = useState<DatePick | null>(null)
  const [sheet, setSheet] = useState<'time' | 'settings' | 'rooms' | 'archive' | 'lastDone' | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [startHidden, setStartHidden] = useState(true) // oppstartsbanneret, skjult til vi vet mer
  const [toast, setToast] = useState<Toast | null>(null)

  const demoRef = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const writes = useRef<Promise<unknown>>(Promise.resolve())

  // ---------- Lasting og sanntid ----------

  /** Oppgaver som aldri er gjort, får startfrist spredt utover, så ikke alt forfaller samtidig. */
  const withSpread = useCallback(async (d: Data, isDemo: boolean): Promise<Data> => {
    const dues = spreadInitialDues(d.chores, d.completions, d.settings, todayString())
    if (dues.size === 0) return d
    if (!isDemo) {
      const byDate = new Map<DateString, string[]>()
      dues.forEach((date, id) => byDate.set(date, [...(byDate.get(date) ?? []), id]))
      const results = await Promise.all(
        [...byDate].map(([date, ids]) => supabase.from('chores').update({ initial_due: date }).in('id', ids).is('initial_due', null))
      )
      results.forEach(r => r.error && console.error(r.error))
    }
    return { ...d, chores: d.chores.map(c => (dues.has(c.id) ? { ...c, initial_due: dues.get(c.id)! } : c)) }
  }, [])

  const refresh = useCallback(async () => {
    if (demoRef.current) return
    try {
      const fresh = await withSpread(await fetchData(), false)
      setData(fresh)
      setStatus('ready')
    } catch (error) {
      console.error(error)
      setStatus(s => (s === 'ready' ? s : 'error'))
    }
  }, [withSpread])

  useEffect(() => {
    const isDemo = new URLSearchParams(window.location.search).has('demo')
    demoRef.current = isDemo
    setDemo(isDemo)
    if (isDemo) {
      withSpread(createDemoData(), true).then(d => {
        setData(d)
        setStatus('ready')
      })
      return
    }

    refresh()
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 400)
    }
    const channel = supabase.channel('rydding')
    for (const table of ['chore_rooms', 'chores', 'chore_completions', 'chore_settings']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon)
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [refresh, withSpread])

  // Ny dag ved midnatt, og ferske data når appen åpnes igjen
  useEffect(() => {
    const tick = () => setToday(todayString())
    const interval = setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      tick()
      refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  // Oppstartsbanneret kan skjules per telefon
  const START_KEY = 'rydding-oppstart-skjult'
  useEffect(() => {
    try {
      setStartHidden(localStorage.getItem(START_KEY) === '1')
    } catch {
      setStartHidden(false)
    }
  }, [])
  const hideStart = () => {
    setStartHidden(true)
    try {
      localStorage.setItem(START_KEY, '1')
    } catch {}
  }

  // ---------- Lagring ----------

  const showToast = useCallback((message: string, actions?: Toast['actions']) => {
    clearTimeout(toastTimer.current)
    setToast({ message, actions })
    toastTimer.current = setTimeout(() => setToast(null), actions ? 7000 : 4000)
  }, [])

  /** Skrivinger går én og én, så «Gjort» og «Endre dato» rett etter kommer i riktig rekkefølge. */
  const write = (run: () => PromiseLike<{ error: unknown }>) => {
    if (demoRef.current) return
    writes.current = writes.current.then(async () => {
      const { error } = await run()
      if (error) {
        console.error(error)
        showToast('Kunne ikke lagre. Sjekk nettet og prøv igjen.')
        refresh()
      }
    })
  }

  const patchChore = (id: string, fields: Partial<Chore>) => {
    setData(d => ({ ...d, chores: d.chores.map(c => (c.id === id ? { ...c, ...fields } : c)) }))
    write(() => supabase.from('chores').update(fields).eq('id', id))
  }

  const hasCompletion = (choreId: string, date: DateString) =>
    dataRef.current.completions.some(c => c.chore_id === choreId && c.done_on === date)

  const addCompletion = (choreId: string, date: DateString) => {
    const row: ChoreCompletion = { id: localId(), chore_id: choreId, done_on: date, created_at: new Date().toISOString() }
    setData(d => ({ ...d, completions: [row, ...d.completions] }))
    write(() => supabase.from('chore_completions').upsert({ chore_id: choreId, done_on: date }, { onConflict: 'chore_id,done_on', ignoreDuplicates: true }))
  }

  const removeCompletion = (choreId: string, date: DateString) => {
    setData(d => ({ ...d, completions: d.completions.filter(c => !(c.chore_id === choreId && c.done_on === date)) }))
    write(() => supabase.from('chore_completions').delete().eq('chore_id', choreId).eq('done_on', date))
  }

  const moveCompletion = (choreId: string, from: DateString, to: DateString) => {
    if (from === to) return
    if (hasCompletion(choreId, to)) return removeCompletion(choreId, from)
    setData(d => ({
      ...d,
      completions: d.completions.map(c => (c.chore_id === choreId && c.done_on === from ? { ...c, done_on: to } : c)),
    }))
    write(() => supabase.from('chore_completions').update({ done_on: to }).eq('chore_id', choreId).eq('done_on', from))
  }

  const saveSettings = (fields: Partial<ChoreSettings>) => {
    setData(d => ({ ...d, settings: { ...d.settings, ...fields } }))
    write(() => supabase.from('chore_settings').update(fields).eq('id', 1))
  }

  // ---------- Handlinger ----------

  const plan = useMemo(() => buildPlan(data.chores, data.completions, data.settings, today), [data, today])
  const roomName = useMemo(() => new Map(data.rooms.map(r => [r.id, r.name])), [data.rooms])
  const choreById = (id: string) => dataRef.current.chores.find(c => c.id === id)
  const snoozeTo = snoozeTarget(plan, data.settings.cleaning_weekday)

  const dateLabel = (date: DateString) =>
    date === today ? 'i dag' : date === addDays(today, -1) ? 'i går' : shortDate(date, today)

  const markDone = (chore: Chore, date: DateString = today) => {
    if (hasCompletion(chore.id, date)) {
      showToast(`«${chore.name}» er allerede registrert ${dateLabel(date)}`)
      return
    }
    addCompletion(chore.id, date)
    const snoozed = chore.snoozed_until
    if (snoozed) patchChore(chore.id, { snoozed_until: null })
    showToast(`✓ ${chore.name} – gjort ${dateLabel(date)}`, [
      {
        label: 'Endre dato',
        run: () => {
          setToast(null)
          setDatePick({ choreId: chore.id, from: date })
        },
      },
      {
        label: 'Angre',
        run: () => {
          setToast(null)
          removeCompletion(chore.id, date)
          if (snoozed) patchChore(chore.id, { snoozed_until: snoozed })
        },
      },
    ])
  }

  const undoToday = (chore: Chore) => {
    removeCompletion(chore.id, today)
    showToast(`«${chore.name}» er ikke lenger registrert i dag`, [
      { label: 'Angre', run: () => { setToast(null); addCompletion(chore.id, today) } },
    ])
  }

  const snooze = (chore: Chore) => {
    const before = chore.snoozed_until
    patchChore(chore.id, { snoozed_until: snoozeTo })
    setOpenId(null)
    showToast(`${chore.name} er utsatt til ${longDate(snoozeTo, today)}`, [
      { label: 'Angre', run: () => { setToast(null); patchChore(chore.id, { snoozed_until: before }) } },
    ])
  }

  // ---------- Oppstart: sist gjort ----------

  /**
   * Lagrer datoene fra oppstartslisten. Oppgavene som fortsatt aldri er gjort og ikke har forfalt ennå,
   * fordeles på nytt rundt de nye datoene, så ukene blir jevne.
   */
  const saveLastDone = (dates: Map<string, DateString>) => {
    setSheet(null)
    if (dates.size === 0) return
    const current = dataRef.current
    const now = new Date().toISOString()
    const rows: ChoreCompletion[] = [...dates].map(([chore_id, done_on]) => ({ id: localId(), chore_id, done_on, created_at: now }))
    const completions = [...rows, ...current.completions]

    const withHistory = new Set(completions.map(c => c.chore_id))
    const reset = current.chores.map(c =>
      !c.archived && !withHistory.has(c.id) && !c.fixed_months?.length && c.initial_due && c.initial_due > today ? { ...c, initial_due: null } : c
    )
    const dues = spreadInitialDues(reset, completions, current.settings, today)
    const chores = reset.map(c => (dues.has(c.id) ? { ...c, initial_due: dues.get(c.id)! } : c))
    const moved = chores.filter(c => c.initial_due !== current.chores.find(o => o.id === c.id)?.initial_due)

    setData(d => ({ ...d, chores, completions }))
    write(() =>
      supabase
        .from('chore_completions')
        .upsert(rows.map(({ chore_id, done_on }) => ({ chore_id, done_on })), { onConflict: 'chore_id,done_on', ignoreDuplicates: true })
    )
    const byDate = new Map<DateString, string[]>()
    for (const c of moved) if (c.initial_due) byDate.set(c.initial_due, [...(byDate.get(c.initial_due) ?? []), c.id])
    byDate.forEach((ids, date) => write(() => supabase.from('chores').update({ initial_due: date }).in('id', ids)))

    hideStart()
    showToast(
      `Lagret ${rows.length} ${rows.length === 1 ? 'dato' : 'datoer'}${moved.length ? `, og ${moved.length} andre oppgaver er fordelt på nytt` : ''}`
    )
  }

  // ---------- Oppgaver og rom ----------

  const createChore = (draft: ChoreDraft, lastDone: DateString | null) => {
    const current = dataRef.current
    const chore: Chore = {
      id: uuidv4(),
      ...draft,
      purchase_done_for: null,
      snoozed_until: null,
      initial_due: null,
      archived: false,
      created_at: new Date().toISOString(),
    }
    // Uten «sist gjort» får den frist i uka med minst å gjøre
    if (!lastDone) {
      chore.initial_due = spreadInitialDues([...current.chores, chore], current.completions, current.settings, today).get(chore.id) ?? null
    }
    setData(d => ({ ...d, chores: [...d.chores, chore] }))
    write(() => supabase.from('chores').insert(chore))
    if (lastDone) addCompletion(chore.id, lastDone)
    setEditor(null)
    showToast(`«${chore.name}» er lagt til`, [
      { label: 'Vis', run: () => { setToast(null); setOpenId(chore.id) } },
    ])
  }

  const saveChore = (chore: Chore, draft: ChoreDraft) => {
    const fields: Partial<Chore> = { ...draft }
    // Aldri gjort og nye faste måneder: fristen flyttes til neste valgte måned
    const neverDone = !dataRef.current.completions.some(c => c.chore_id === chore.id)
    if (neverDone && draft.fixed_months?.length && !sameMonths(chore.fixed_months, draft.fixed_months)) {
      fields.initial_due = cleaningDayInMonths(plan.nextCleaningDay, draft.fixed_months, data.settings.cleaning_weekday)
    }
    if (draft.purchase_item !== chore.purchase_item) fields.purchase_done_for = null
    patchChore(chore.id, fields)
    setEditor(null)
    showToast('Endringene er lagret')
  }

  const archiveChore = (chore: Chore) => {
    patchChore(chore.id, { archived: true })
    setEditor(null)
    setOpenId(null)
    showToast(`«${chore.name}» er arkivert`, [
      { label: 'Angre', run: () => { setToast(null); patchChore(chore.id, { archived: false }) } },
    ])
  }

  const restoreChore = (chore: Chore) => {
    patchChore(chore.id, { archived: false })
    showToast(`«${chore.name}» er hentet tilbake`)
  }

  const addRoom = (name: string, room?: ChoreRoom) => {
    const next = room ?? {
      id: uuidv4(),
      name,
      sort_order: Math.max(0, ...dataRef.current.rooms.map(r => r.sort_order)) + 1,
      created_at: new Date().toISOString(),
    }
    setData(d => ({ ...d, rooms: [...d.rooms, next].sort((a, b) => a.sort_order - b.sort_order) }))
    write(() => supabase.from('chore_rooms').insert(next))
  }

  const renameRoom = (room: ChoreRoom, name: string) => {
    setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === room.id ? { ...r, name } : r)) }))
    write(() => supabase.from('chore_rooms').update({ name }).eq('id', room.id))
  }

  const moveRoom = (room: ChoreRoom, direction: -1 | 1) => {
    const before = dataRef.current.rooms
    const rooms = [...before].sort((a, b) => a.sort_order - b.sort_order)
    const i = rooms.findIndex(r => r.id === room.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= rooms.length) return
    ;[rooms[i], rooms[j]] = [rooms[j], rooms[i]]
    const renumbered = rooms.map((r, k) => ({ ...r, sort_order: k + 1 }))
    setData(d => ({ ...d, rooms: renumbered }))
    for (const r of renumbered) {
      if (before.find(b => b.id === r.id)?.sort_order !== r.sort_order) {
        write(() => supabase.from('chore_rooms').update({ sort_order: r.sort_order }).eq('id', r.id))
      }
    }
  }

  const deleteRoom = (room: ChoreRoom) => {
    if (dataRef.current.chores.some(c => c.room_id === room.id)) return
    setData(d => ({ ...d, rooms: d.rooms.filter(r => r.id !== room.id) }))
    write(() => supabase.from('chore_rooms').delete().eq('id', room.id))
    if (roomFilter === room.id) setRoomFilter('all')
    showToast(`Rommet «${room.name}» er slettet`, [
      { label: 'Angre', run: () => { setToast(null); addRoom(room.name, room) } },
    ])
  }

  const saveDatePick = (date: DateString) => {
    if (!datePick) return
    const chore = choreById(datePick.choreId)
    setDatePick(null)
    if (!chore) return
    if (datePick.from) {
      moveCompletion(chore.id, datePick.from, date)
      showToast(`${chore.name}: endret til ${dateLabel(date)}`)
    } else {
      markDone(chore, date)
    }
  }

  const deleteDatePick = () => {
    if (!datePick?.from) return
    const { choreId, from } = datePick
    const chore = choreById(choreId)
    setDatePick(null)
    removeCompletion(choreId, from)
    showToast(`Slettet ${shortDate(from, today)}${chore ? ` for ${chore.name}` : ''}`, [
      { label: 'Angre', run: () => { setToast(null); addCompletion(choreId, from) } },
    ])
  }

  // ---------- Filter ----------

  const intervals = useMemo(() => [...new Set(data.chores.filter(c => !c.archived).map(c => c.interval_weeks))].sort((a, b) => a - b), [data.chores])
  const filtering = roomFilter !== 'all' || intervalFilter !== 'all'
  const matches = (s: ChoreState) =>
    (roomFilter === 'all' || s.chore.room_id === roomFilter) && (intervalFilter === 'all' || s.chore.interval_weeks === intervalFilter)
  const filterSummary = [
    roomFilter === 'all' ? 'Alle rom' : roomName.get(roomFilter),
    intervalFilter === 'all' ? 'alle intervaller' : intervalText(intervalFilter),
  ].join(' · ')

  // ---------- Visning ----------

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Laster ryddingen …</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-3">🧹</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Fikk ikke hentet ryddingen</h1>
          <p className="text-slate-500 text-sm">Sjekk nettet og prøv igjen.</p>
          <button onClick={() => { setStatus('loading'); refresh() }} className="mt-4 rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white">
            Prøv igjen
          </button>
        </div>
      </div>
    )
  }

  const isToday = plan.day === today
  const isCleaningDay = today === plan.nextCleaningDay
  const heroLabel = plan.extra
    ? isCleaningDay ? 'Ryddedag i dag · egen tid' : 'Ekstra rydding i dag'
    : isToday ? 'Ryddedag i dag' : 'Neste ryddedag'
  const total = plan.usedMinutes + plan.plannedMinutes
  const pct = (minutes: number) => `${Math.min(100, (minutes / Math.max(plan.cap, total)) * 100)}%`
  const overCap = total > plan.cap

  const rows = (list: ChoreState[]) => (
    <ul className="space-y-2">
      {list.filter(matches).map(s => (
        <ChoreRow
          key={s.chore.id}
          state={s}
          roomName={roomName.get(s.chore.room_id) ?? ''}
          today={today}
          onOpen={() => setOpenId(s.chore.id)}
          onDone={() => markDone(s.chore)}
          onUndo={() => undoToday(s.chore)}
        />
      ))}
    </ul>
  )

  const section = (title: string, list: ChoreState[], note?: string, minutes = false) => {
    const shown = list.filter(matches)
    if (shown.length === 0) return null
    const sum = shown.reduce((n, s) => n + s.chore.est_minutes, 0)
    return (
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
          <span className="text-xs text-slate-400">
            {shown.length} {shown.length === 1 ? 'oppgave' : 'oppgaver'}{minutes ? ` · ${mins(sum)}` : ''}
          </span>
        </div>
        {note && <p className="-mt-1 mb-2 text-xs text-slate-500">{note}</p>}
        {rows(list)}
      </section>
    )
  }

  const plannedShown = plan.planned.filter(matches)
  const laterShown = plan.later.filter(matches)
  const openState = openId ? plan.states.get(openId) : undefined
  const pickChore = datePick ? data.chores.find(c => c.id === datePick.choreId) : undefined
  const historyOf = (choreId: string) =>
    data.completions.filter(c => c.chore_id === choreId).map(c => c.done_on).sort((a, b) => b.localeCompare(a))
  const archived = data.chores.filter(c => c.archived)
  const withHistory = new Set(data.completions.map(c => c.chore_id))
  const neverDone = data.chores.filter(c => !c.archived && !withHistory.has(c.id))
  const showStart = !startHidden && neverDone.length >= 10
  const choreCounts = new Map<string, number>()
  for (const c of data.chores) choreCounts.set(c.room_id, (choreCounts.get(c.room_id) ?? 0) + 1)
  const forcedCount = plan.planned.filter(s => s.forced).length
  const editing = editor?.mode === 'edit' ? data.chores.find(c => c.id === editor.choreId) : undefined

  return (
    <div className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="sr-only">Rydding</h1>
          <AppSwitcher active="rydding" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditor({ mode: 'new', roomId: roomFilter === 'all' ? null : roomFilter })}
              aria-label="Ny oppgave"
              title="Ny oppgave"
              className="h-10 rounded-full bg-violet-50 px-3 text-sm font-bold text-violet-700 hover:bg-violet-100"
            >
              + Ny
            </button>
            <button onClick={() => setSheet('settings')} aria-label="Innstillinger" title="Innstillinger" className="h-10 w-10 rounded-full text-xl hover:bg-slate-100">
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {demo && (
          <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">Demo: ingenting lagres.</p>
        )}

        {showStart && (
          <section className="mb-4 rounded-2xl border border-violet-200 bg-white px-4 py-3 shadow-sm">
            <p className="font-bold text-slate-800">👋 Når gjorde dere ting sist?</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Legg inn det dere husker, så blir forslagene riktigere. Resten fordeles utover ukene.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => setSheet('lastDone')} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">
                Legg inn sist gjort
              </button>
              <button onClick={hideStart} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500">
                Ikke nå
              </button>
            </div>
          </section>
        )}

        {/* Neste ryddedag */}
        <section className="rounded-3xl bg-violet-600 px-5 py-4 text-white shadow-lg shadow-violet-600/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
            {heroLabel}
            {!isToday && ` · ${relativeDay(plan.day, today)}`}
          </p>
          <h2 className="mt-0.5 text-2xl font-extrabold">{capitalize(longDate(plan.day, today))}</h2>

          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="bg-emerald-300" style={{ width: pct(plan.usedMinutes) }} />
            <div className={overCap ? 'bg-amber-300' : 'bg-white'} style={{ width: pct(plan.plannedMinutes) }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm">
              {plan.usedMinutes > 0 ? (
                <>
                  <span className="font-bold">{plan.usedMinutes} gjort</span>, {plan.plannedMinutes} igjen · av {mins(plan.cap)}
                </>
              ) : (
                <>
                  <span className="font-bold">{plan.plannedMinutes}</span> av {mins(plan.cap)}
                </>
              )}
            </p>
            <button
              onClick={() => setSheet('time')}
              className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
            >
              ⏱ {plan.extra ? 'Endre tiden' : 'Endre tid i dag'}
            </button>
          </div>
          {plan.extra && (
            <p className="mt-2 text-xs text-violet-100">
              Vanlig tid er {mins(data.settings.cap_minutes)}.
              {!isCleaningDay && ` Neste ryddedag er ${longDate(plan.nextCleaningDay, today)}.`}{' '}
              <button onClick={() => saveSettings({ cap_today: null, cap_today_on: null })} className="font-semibold underline underline-offset-2">
                Tilbake til vanlig
              </button>
            </p>
          )}
          {forcedCount > 0 ? (
            <p className="mt-2 text-xs text-violet-100">
              Går over tiden fordi {forcedCount === 1 ? 'en rød oppgave' : `${forcedCount} røde oppgaver`} alltid tas med.
            </p>
          ) : overCap && plan.planned.length === 1 && plan.usedMinutes === 0 ? (
            <p className="mt-2 text-xs text-violet-100">Den øverste oppgaven tar lengre tid enn dere har, men er tatt med fordi den haster mest.</p>
          ) : null}
        </section>

        {/* Filter */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              aria-expanded={showFilters}
              className={`flex min-w-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                filtering ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <span className="truncate">{filtering ? filterSummary : 'Filtrer på rom eller intervall'}</span>
              <span aria-hidden className="text-xs">{showFilters ? '▲' : '▼'}</span>
            </button>
            {filtering && (
              <button onClick={() => { setRoomFilter('all'); setIntervalFilter('all') }} className="text-sm font-semibold text-slate-500">
                Nullstill
              </button>
            )}
          </div>
          {showFilters && (
            <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap gap-1.5">
                {[{ id: 'all', name: 'Alle rom' }, ...data.rooms].map(room => (
                  <button
                    key={room.id}
                    onClick={() => setRoomFilter(room.id)}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      roomFilter === room.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...intervals] as const).map(weeks => (
                  <button
                    key={weeks}
                    onClick={() => setIntervalFilter(weeks)}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      intervalFilter === weeks ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {weeks === 'all' ? 'Alle intervaller' : capitalize(intervalText(weeks))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Forslag */}
        <section className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {plan.extra && !isCleaningDay ? 'Forslag i dag' : 'Forslag'}
            </h2>
            {plannedShown.length > 0 && (
              <span className="text-xs text-slate-400">
                {plannedShown.length} {plannedShown.length === 1 ? 'oppgave' : 'oppgaver'} ·{' '}
                {mins(plannedShown.reduce((n, s) => n + s.chore.est_minutes, 0))}
              </span>
            )}
          </div>
          {plannedShown.length > 0 ? (
            rows(plan.planned)
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-1 font-semibold text-slate-700">
                {filtering ? 'Ingenting her med dette filteret.' : isToday ? 'Alt er gjort for i dag!' : 'Ingenting å gjøre ennå.'}
              </p>
              {!filtering && plan.soon.length > 0 && (
                <p className="mt-1 text-sm text-slate-500">Har dere tid, kan dere ta noe fra «Kommer snart».</p>
              )}
            </div>
          )}
        </section>

        {section('Får ikke plass', plan.noRoom, 'Forfaller, men får ikke plass i tiden. Står først i køen neste gang.', true)}
        {section(
          'Kommer snart',
          plan.soon,
          plan.extra ? 'Forfaller de neste fire ukene. Kan tas tidlig hvis dere har tid.' : `Forfaller innen ${WEEKDAYS[data.settings.cleaning_weekday]} om en uke. Kan tas tidlig hvis dere har tid.`,
          true,
        )}
        {section('Utsatt', plan.snoozed, 'Kommer tilbake på neste ryddedag. Fristen er den samme.')}
        {section('Gjort i dag', plan.doneToday)}

        {laterShown.length > 0 &&
          (showLater || filtering ? (
            section('Senere', plan.later)
          ) : (
            <button onClick={() => setShowLater(true)} className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600">
              Vis resten av oppgavene ({laterShown.length})
            </button>
          ))}

        <ul className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {STATUS_ORDER.slice().reverse().map(s => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} aria-hidden />
              {STATUS_STYLE[s].label}
            </li>
          ))}
        </ul>
      </main>

      {toast && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[60] flex w-[min(92%,32rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.actions?.map(action => (
            <button key={action.label} onClick={action.run} className="flex-shrink-0 font-semibold text-violet-300">
              {action.label}
            </button>
          ))}
        </div>
      )}

      {openState && (
        <ChoreSheet
          state={openState}
          roomName={roomName.get(openState.chore.room_id) ?? ''}
          history={historyOf(openState.chore.id)}
          today={today}
          snoozeTo={snoozeTo}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditor({ mode: 'edit', choreId: openState.chore.id })}
          onDone={() => markDone(openState.chore)}
          onDoneOtherDay={() => setDatePick({ choreId: openState.chore.id, from: null })}
          onSnooze={() => snooze(openState.chore)}
          onUnsnooze={() => patchChore(openState.chore.id, { snoozed_until: null })}
          onEditDate={date => setDatePick({ choreId: openState.chore.id, from: date })}
          onAddDate={() => setDatePick({ choreId: openState.chore.id, from: null })}
        />
      )}

      {datePick && pickChore && (
        <DoneDateSheet
          key={`${datePick.choreId}-${datePick.from}`}
          choreName={pickChore.name}
          initial={datePick.from ?? (hasCompletion(pickChore.id, today) ? addDays(today, -1) : today)}
          today={today}
          existing={historyOf(pickChore.id).filter(d => d !== datePick.from)}
          onSave={saveDatePick}
          onDelete={datePick.from ? deleteDatePick : undefined}
          onCancel={() => setDatePick(null)}
        />
      )}

      {sheet === 'time' && (
        <TimeSheet
          current={plan.cap}
          normal={data.settings.cap_minutes}
          active={capTodayActive(data.settings, today)}
          today={today}
          nextCleaningDay={plan.nextCleaningDay}
          cleaningWeekday={data.settings.cleaning_weekday}
          onSave={minutes => {
            setSheet(null)
            saveSettings({ cap_today: minutes, cap_today_on: today })
          }}
          onReset={() => {
            setSheet(null)
            saveSettings({ cap_today: null, cap_today_on: null })
          }}
          onCancel={() => setSheet(null)}
        />
      )}

      {sheet === 'settings' && (
        <SettingsSheet
          settings={data.settings}
          roomCount={data.rooms.length}
          archivedCount={archived.length}
          neverDoneCount={neverDone.length}
          onLastDone={() => setSheet('lastDone')}
          onSave={fields => {
            setSheet(null)
            saveSettings(fields)
            showToast('Innstillingene er lagret')
          }}
          onRooms={() => setSheet('rooms')}
          onArchive={() => setSheet('archive')}
          onCancel={() => setSheet(null)}
        />
      )}

      {sheet === 'lastDone' && (
        <LastDoneSheet
          chores={neverDone}
          rooms={data.rooms}
          settings={data.settings}
          today={today}
          onSave={saveLastDone}
          onCancel={() => setSheet(null)}
        />
      )}

      {sheet === 'rooms' && (
        <RoomsSheet
          rooms={data.rooms}
          counts={choreCounts}
          onAdd={name => addRoom(name)}
          onRename={renameRoom}
          onMove={moveRoom}
          onDelete={deleteRoom}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'archive' && (
        <ArchiveSheet
          chores={archived}
          roomName={id => roomName.get(id) ?? ''}
          lastDone={lastDoneMap(data.completions)}
          today={today}
          onRestore={restoreChore}
          onClose={() => setSheet(null)}
        />
      )}

      {editor?.mode === 'new' && (
        <ChoreEditor
          key="new"
          initial={{
            name: '',
            room_id: editor.roomId ?? '',
            interval_weeks: 4,
            priority: 'medium',
            est_minutes: 15,
            fixed_months: null,
            purchase_item: null,
            notes: null,
          }}
          rooms={data.rooms}
          isNew
          today={today}
          onSave={createChore}
          onCancel={() => setEditor(null)}
        />
      )}

      {editing && (
        <ChoreEditor
          key={editing.id}
          initial={draftOf(editing)}
          rooms={data.rooms}
          isNew={false}
          today={today}
          stacked={!!openState}
          onSave={draft => saveChore(editing, draft)}
          onArchive={() => archiveChore(editing)}
          onCancel={() => setEditor(null)}
        />
      )}
    </div>
  )
}
