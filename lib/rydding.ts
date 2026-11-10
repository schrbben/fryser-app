import seed from './ryddingSeed.json'

// ---------- Datamodell (tabellene i supabase/rydding.sql) ----------

export type Priority = 'high' | 'medium' | 'low'

/** Datoer uten klokkeslett lagres som 'YYYY-MM-DD' (norsk dato). */
export type DateString = string

export type ChoreRoom = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export type Chore = {
  id: string
  name: string
  room_id: string
  interval_weeks: number
  priority: Priority
  est_minutes: number
  fixed_months: number[] | null // 1 = januar
  purchase_item: string | null
  purchase_done_for: DateString | null // fristen varen er kjøpt for
  notes: string | null
  snoozed_until: DateString | null // utsatt til denne ryddedagen
  initial_due: DateString | null // startfrist før første gang er registrert
  archived: boolean
  created_at: string
}

export type ChoreCompletion = {
  id: string
  chore_id: string
  done_on: DateString
  created_at: string
}

export type ChoreSettings = {
  id: 1
  cleaning_weekday: number // 0 = søndag, som Date.getDay()
  cap_minutes: number
  notify_time: string // 'HH:MM' eller 'HH:MM:SS' fra databasen
}

// ---------- Faste verdier ----------

export const PRIORITIES: Record<Priority, {
  name: string
  redFactor: number // rødgrense = intervall i dager × faktor
  weight: number // vekt i hastegraden
}> = {
  high: { name: 'Høy', redFactor: 0.25, weight: 1.5 },
  medium: { name: 'Middels', redFactor: 0.5, weight: 1.2 },
  low: { name: 'Lav', redFactor: 1, weight: 1 },
}

export const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low']

/** Rødgrensen er aldri under 1 dag og aldri over 8 uker. */
export const RED_LIMIT_DAYS = { min: 1, max: 56 }

export const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

/** Innkjøp vises i handlelista når oppgaven forfaller innen så mange dager. */
export const PURCHASE_LEAD_DAYS = 7

// ---------- Startdata ----------

type SeedChore = {
  name: string
  interval_weeks: number
  priority: Priority
  est_minutes: number
  fixed_months?: number[]
  purchase_item?: string
}

type SeedRoom = { name: string; chores: SeedChore[] }

/** Samme startdata som i supabase/rydding.sql (generert fra lib/ryddingSeed.json). */
export const SEED_ROOMS = seed.rooms as SeedRoom[]

export const DEFAULT_SETTINGS: ChoreSettings = { id: 1, ...seed.settings }

/** Startdataene i minnet, brukt med ?demo så ingenting skrives til databasen. */
export function createDemoData(): {
  rooms: ChoreRoom[]
  chores: Chore[]
  completions: ChoreCompletion[]
  settings: ChoreSettings
} {
  const now = Date.now()
  const rooms: ChoreRoom[] = []
  const chores: Chore[] = []

  SEED_ROOMS.forEach((room, roomIndex) => {
    const roomId = `demo-room-${roomIndex + 1}`
    rooms.push({ id: roomId, name: room.name, sort_order: roomIndex + 1, created_at: new Date(now).toISOString() })
    for (const chore of room.chores) {
      chores.push({
        id: `demo-chore-${chores.length + 1}`,
        name: chore.name,
        room_id: roomId,
        interval_weeks: chore.interval_weeks,
        priority: chore.priority,
        est_minutes: chore.est_minutes,
        fixed_months: chore.fixed_months ?? null,
        purchase_item: chore.purchase_item ?? null,
        purchase_done_for: null,
        notes: null,
        snoozed_until: null,
        initial_due: null,
        archived: false,
        created_at: new Date(now + chores.length).toISOString(),
      })
    }
  })

  return { rooms, chores, completions: [], settings: { ...DEFAULT_SETTINGS } }
}
