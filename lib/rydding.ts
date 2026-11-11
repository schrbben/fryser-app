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
  cap_today: number | null // annen tid enn vanlig, bare for dagen under
  cap_today_on: DateString | null
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

/** Ukedagene i norsk rekkefølge, mandag først. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

/** Innkjøp vises i handlelista når oppgaven forfaller innen så mange dager. */
export const PURCHASE_LEAD_DAYS = 7

/** Med ekstra tid kan forslagene hentes fra oppgaver som forfaller så langt frem. */
export const EXTRA_HORIZON_DAYS = 28

// ---------- Datoer ----------
// Alle datoer er 'YYYY-MM-DD' i norsk tid og regnes som hele dager, så sommertid ikke spiller inn.

const DAY_MS = 86_400_000

export function dayNumber(date: DateString): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function fromDayNumber(n: number): DateString {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export const addDays = (date: DateString, days: number) => fromDayNumber(dayNumber(date) + days)

/** Antall dager fra `from` til `to` (negativt hvis `to` er før). */
export const daysBetween = (from: DateString, to: DateString) => dayNumber(to) - dayNumber(from)

export const weekdayOf = (date: DateString) => new Date(dayNumber(date) * DAY_MS).getUTCDay()

const monthOf = (date: DateString) => Number(date.slice(5, 7))

const maxDate = (a: DateString, b: DateString) => (a > b ? a : b)

/** Dagens dato i Norge, uansett hvor telefonen står innstilt. */
export function todayString(now = new Date()): DateString {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Første ryddedag på eller etter datoen. */
export function cleaningDayOnOrAfter(date: DateString, weekday: number): DateString {
  return addDays(date, (weekday - weekdayOf(date) + 7) % 7)
}

/** Første ryddedag i en av månedene, på eller etter datoen. */
export function cleaningDayInMonths(from: DateString, months: number[], weekday: number): DateString {
  let day = cleaningDayOnOrAfter(from, weekday)
  for (let i = 0; i < 60 && !months.includes(monthOf(day)); i++) day = addDays(day, 7)
  return day
}

function firstOfNextMonth(date: DateString): DateString {
  const [y, m] = date.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

// ---------- Frist, farge og hastegrad ----------

export type Status = 'green' | 'yellow' | 'orange' | 'red'

export const STATUS_ORDER: Status[] = ['red', 'orange', 'yellow', 'green']

/** Siste gang hver oppgave ble gjort. */
export function lastDoneMap(completions: ChoreCompletion[]): Map<string, DateString> {
  const last = new Map<string, DateString>()
  for (const c of completions) {
    const prev = last.get(c.chore_id)
    if (!prev || c.done_on > prev) last.set(c.chore_id, c.done_on)
  }
  return last
}

/**
 * Neste frist regnes fra datoen oppgaven faktisk ble gjort.
 * Med faste måneder er fristen første ryddedag i neste faste måned, men minst et halvt intervall
 * etter siste gang, så vinduer vasket litt tidlig i mars ikke forfaller igjen i april.
 * Null betyr at oppgaven aldri er gjort og ikke har fått startfrist ennå.
 */
export function dueDate(chore: Chore, last: DateString | null, weekday: number): DateString | null {
  if (!last) return chore.initial_due
  if (chore.fixed_months?.length) {
    const earliest = maxDate(firstOfNextMonth(last), addDays(last, Math.round((chore.interval_weeks * 7) / 2)))
    return cleaningDayInMonths(earliest, chore.fixed_months, weekday)
  }
  return addDays(last, chore.interval_weeks * 7)
}

/** Dager over frist før oppgaven blir rød. */
export function redLimitDays(chore: Chore): number {
  const days = Math.ceil(chore.interval_weeks * 7 * PRIORITIES[chore.priority].redFactor)
  return Math.min(RED_LIMIT_DAYS.max, Math.max(RED_LIMIT_DAYS.min, days))
}

export function statusOf(chore: Chore, due: DateString, today: DateString, nextCleaningDay: DateString): Status {
  if (due > nextCleaningDay) return 'green'
  if (due >= today) return 'yellow'
  return daysBetween(due, today) >= redLimitDays(chore) ? 'red' : 'orange'
}

/**
 * Hastegrad = (dager siden sist gjort ÷ intervall i dager) × vekt, regnet for dagen planen gjelder.
 * I tillegg kommer hvor langt oppgaven har kommet mot rødgrensen (0 ved frist, 1 når den blir rød).
 * Uten tillegget får lange, sjeldne oppgaver aldri plass før de er røde, fordi korte ukentlige
 * oppgaver alltid veier tyngre.
 */
export function urgency(chore: Chore, due: DateString, at: DateString): number {
  const intervalDays = chore.interval_weeks * 7
  const late = daysBetween(due, at)
  const base = ((late + intervalDays) / intervalDays) * PRIORITIES[chore.priority].weight
  return base + Math.max(0, late) / redLimitDays(chore)
}

// ---------- Forslag til ryddedagen ----------

export type ChoreState = {
  chore: Chore
  last: DateString | null
  due: DateString
  status: Status
  urgency: number
  snoozed: boolean // utsatt forbi dagen planen gjelder
  doneToday: boolean
  early: boolean // tatt med i forslaget før fristen
  forced: boolean // tatt med selv om tiden ikke strekker til, fordi den er rød
}

export type Plan = {
  day: DateString // dagen forslaget gjelder
  nextCleaningDay: DateString
  extra: boolean // annen tid enn vanlig i dag
  cap: number
  usedMinutes: number // gjort i dag, trekkes fra taket når planen gjelder i dag
  plannedMinutes: number
  planned: ChoreState[] // forslag, rangert
  noRoom: ChoreState[] // forfaller, men får ikke plass
  soon: ChoreState[] // kan tas tidlig
  snoozed: ChoreState[]
  doneToday: ChoreState[]
  later: ChoreState[]
  states: Map<string, ChoreState>
}

/** Har «tid i dag» blitt satt for akkurat i dag? */
export const capTodayActive = (settings: ChoreSettings, today: DateString) =>
  settings.cap_today != null && settings.cap_today_on === today

/**
 * Lager forslaget:
 * 1. Alt som forfaller på eller før dagen, unntatt det som er utsatt forbi den.
 * 2. Rangert etter hastegrad.
 * 3. Fylles til taket. Den øverste tas alltid med når ingenting er gjort ennå, og det som er rødt
 *    på dagen tas alltid med, også over taket.
 * 4. Er det tid igjen, fylles det på med det som forfaller innen neste ryddedag
 *    (med ekstra tid: de neste fire ukene), det med nærmest frist først.
 *    Det som er gjort for under et halvt intervall siden tas ikke tidlig.
 * 5. Resten havner under «Får ikke plass» og «Kommer snart».
 * Med «tid i dag» gjelder forslaget i dag, selv om det ikke er ryddedag.
 */
export function buildPlan(chores: Chore[], completions: ChoreCompletion[], settings: ChoreSettings, today: DateString): Plan {
  const weekday = settings.cleaning_weekday
  const nextCleaningDay = cleaningDayOnOrAfter(today, weekday)
  const extra = capTodayActive(settings, today)
  const day = extra ? today : nextCleaningDay
  const cap = extra ? settings.cap_today! : settings.cap_minutes

  const last = lastDoneMap(completions)
  const doneTodayIds = new Set(completions.filter(c => c.done_on === today).map(c => c.chore_id))

  const states = new Map<string, ChoreState>()
  for (const chore of chores) {
    if (chore.archived) continue
    const l = last.get(chore.id) ?? null
    const due = dueDate(chore, l, weekday) ?? nextCleaningDay
    states.set(chore.id, {
      chore,
      last: l,
      due,
      status: statusOf(chore, due, today, nextCleaningDay),
      urgency: urgency(chore, due, day),
      snoozed: !!chore.snoozed_until && chore.snoozed_until > day,
      doneToday: doneTodayIds.has(chore.id),
      early: false,
      forced: false,
    })
  }

  const all = [...states.values()]
  const byUrgency = (a: ChoreState, b: ChoreState) =>
    b.urgency - a.urgency ||
    PRIORITY_ORDER.indexOf(a.chore.priority) - PRIORITY_ORDER.indexOf(b.chore.priority) ||
    a.due.localeCompare(b.due) ||
    a.chore.name.localeCompare(b.chore.name, 'nb')
  const byDue = (a: ChoreState, b: ChoreState) => a.due.localeCompare(b.due) || byUrgency(a, b)

  const doneToday = all.filter(s => s.doneToday).sort((a, b) => a.chore.name.localeCompare(b.chore.name, 'nb'))
  const usedMinutes = day === today ? doneToday.reduce((sum, s) => sum + s.chore.est_minutes, 0) : 0
  const open = all.filter(s => !s.doneToday)
  const snoozed = open.filter(s => s.snoozed).sort(byDue)
  const active = open.filter(s => !s.snoozed)

  let remaining = cap - usedMinutes
  const planned: ChoreState[] = []
  const noRoom: ChoreState[] = []
  // remaining kan bli negativ når røde oppgaver tas med over taket

  const redOnDay = (s: ChoreState) => daysBetween(s.due, day) >= redLimitDays(s.chore)
  const candidates = active.filter(s => s.due <= day).sort(byUrgency)
  for (const s of candidates) {
    const fits = s.chore.est_minutes <= remaining
    const forceTop = planned.length === 0 && usedMinutes === 0
    if (fits || forceTop || redOnDay(s)) {
      s.forced = !fits && !forceTop
      planned.push(s)
      remaining -= s.chore.est_minutes
    } else {
      noRoom.push(s)
    }
  }

  // Det som tas tidlig, tas i fristrekkefølge: det som snart egentlig skal gjøres, først
  const horizon = addDays(day, extra ? EXTRA_HORIZON_DAYS : 7)
  const earlyOk = (s: ChoreState) => !s.last || daysBetween(s.last, day) * 2 >= s.chore.interval_weeks * 7
  const pool = active.filter(s => s.due > day && s.due <= horizon && earlyOk(s)).sort(byDue)
  const soon: ChoreState[] = []
  for (const s of pool) {
    if (s.chore.est_minutes <= remaining) {
      s.early = true
      planned.push(s)
      remaining -= s.chore.est_minutes
    } else {
      soon.push(s)
    }
  }

  const shown = new Set([...planned, ...noRoom, ...soon, ...snoozed, ...doneToday])
  const later = all.filter(s => !shown.has(s)).sort(byDue)

  return {
    day,
    nextCleaningDay,
    extra,
    cap,
    usedMinutes,
    plannedMinutes: planned.reduce((sum, s) => sum + s.chore.est_minutes, 0),
    planned,
    noRoom,
    soon,
    snoozed,
    doneToday,
    later,
    states,
  }
}

// ---------- Innkjøp ----------

/**
 * Varen er kjøpt for denne fristen. `purchase_done_for` er fristen da varen ble huket av. Når oppgaven
 * gjøres, flytter fristen seg forbi den, og varen må kjøpes på nytt neste gang.
 */
export const isBought = (chore: Chore, due: DateString) => !!chore.purchase_done_for && chore.purchase_done_for >= due

/**
 * Handlelista: varer til oppgaver som forfaller innen en uke, eller som er med i forslaget
 * (også de som tas tidlig). Står der til varen er kjøpt eller oppgaven gjort.
 */
export function shoppingList(plan: Plan, today: DateString): ChoreState[] {
  const planned = new Set(plan.planned.map(s => s.chore.id))
  return [...plan.states.values()]
    .filter(s =>
      !!s.chore.purchase_item &&
      !s.doneToday &&
      !isBought(s.chore, s.due) &&
      (daysBetween(today, s.due) <= PURCHASE_LEAD_DAYS || planned.has(s.chore.id))
    )
    .sort((a, b) => a.due.localeCompare(b.due) || a.chore.name.localeCompare(b.chore.name, 'nb'))
}

/** Ryddedagen etter den forslaget gjelder, brukt når en oppgave utsettes. */
export function snoozeTarget(plan: Plan, weekday: number): DateString {
  return cleaningDayOnOrAfter(addDays(plan.day, 1), weekday)
}

// ---------- Spredning ved oppstart ----------

const SPREAD_WEEKS = 52

/**
 * Gir startfrist til oppgaver som aldri er gjort og ikke har startfrist, så ikke alt forfaller på én gang:
 * - Faste måneder: første ryddedag i neste faste måned.
 * - Ukentlige: første ryddedag.
 * - Resten fordeles på de første N ryddedagene (N = intervallet i uker). Lengste oppgave først,
 *   og hver legges i uken med minst minutter så langt. Oppgaven teller med hver gang den kommer igjen.
 * Oppgaver som allerede har frist, teller med i belastningen.
 */
export function spreadInitialDues(chores: Chore[], completions: ChoreCompletion[], settings: ChoreSettings, today: DateString): Map<string, DateString> {
  const weekday = settings.cleaning_weekday
  const first = cleaningDayOnOrAfter(today, weekday)
  const load = new Array<number>(SPREAD_WEEKS).fill(0)
  const weekIndex = (date: DateString) => Math.max(0, Math.floor(daysBetween(first, date) / 7))
  const addLoad = (start: number, every: number, minutes: number) => {
    for (let w = start; w < SPREAD_WEEKS; w += every) load[w] += minutes
  }

  const last = lastDoneMap(completions)
  const result = new Map<string, DateString>()
  const needs: Chore[] = []

  for (const chore of chores) {
    if (chore.archived) continue
    const due = dueDate(chore, last.get(chore.id) ?? null, weekday)
    if (due) addLoad(weekIndex(due), chore.interval_weeks, chore.est_minutes)
    else needs.push(chore)
  }

  const place = (chore: Chore, week: number) => {
    result.set(chore.id, addDays(first, week * 7))
    addLoad(week, chore.interval_weeks, chore.est_minutes)
  }

  for (const chore of needs.filter(c => c.fixed_months?.length)) {
    const due = cleaningDayInMonths(first, chore.fixed_months!, weekday)
    result.set(chore.id, due)
    addLoad(weekIndex(due), chore.interval_weeks, chore.est_minutes)
  }

  const rest = needs.filter(c => !c.fixed_months?.length)
  for (const chore of rest.filter(c => c.interval_weeks === 1)) place(chore, 0)

  const spread = rest
    .filter(c => c.interval_weeks > 1)
    .sort((a, b) => b.est_minutes - a.est_minutes || a.interval_weeks - b.interval_weeks || a.name.localeCompare(b.name, 'nb'))

  for (const chore of spread) {
    const every = chore.interval_weeks
    let best = 0
    let bestKey: [number, number] = [Infinity, Infinity]
    for (let k = 0; k < Math.min(every, SPREAD_WEEKS); k++) {
      let max = 0
      let sum = 0
      let count = 0
      for (let w = k; w < SPREAD_WEEKS; w += every) {
        max = Math.max(max, load[w])
        sum += load[w]
        count++
      }
      // Minst snittbelastning i ukene oppgaven havner i, deretter minst i den travleste
      const key: [number, number] = [sum / count, max]
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = k
        bestKey = key
      }
    }
    place(chore, best)
  }

  return result
}

// ---------- Tekster ----------

export function longDate(date: DateString, today?: DateString): string {
  const [y, m, d] = date.split('-').map(Number)
  const year = today && today.slice(0, 4) !== date.slice(0, 4) ? ` ${y}` : ''
  return `${WEEKDAYS[weekdayOf(date)]} ${d}. ${MONTHS[m - 1]}${year}`
}

export function shortDate(date: DateString, today?: DateString): string {
  const [y, m, d] = date.split('-').map(Number)
  const year = today && today.slice(0, 4) !== date.slice(0, 4) ? ` ${y}` : ''
  return `${d}. ${MONTHS[m - 1].slice(0, 3)}${year}`
}

/** «i dag», «i morgen», «om 3 dager», «i går», «for 5 dager siden». */
export function relativeDay(date: DateString, today: DateString): string {
  const d = daysBetween(today, date)
  if (d === 0) return 'i dag'
  if (d === 1) return 'i morgen'
  if (d === -1) return 'i går'
  if (d > 1) return `om ${d} dager`
  return `for ${-d} dager siden`
}

function amount(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function overdueText(days: number): string {
  return days >= 14 ? `${amount(Math.floor(days / 7), 'uke', 'uker')} over frist` : `${amount(days, 'dag', 'dager')} over frist`
}

export function dueText(due: DateString, today: DateString): string {
  const d = daysBetween(today, due)
  if (d < 0) return overdueText(-d)
  if (d === 0) return 'Frist i dag'
  if (d === 1) return 'Frist i morgen'
  if (d < 7) return `Frist ${WEEKDAYS[weekdayOf(due)]}`
  return `Frist ${shortDate(due, today)}`
}

export function monthsText(months: number[]): string {
  const names = [...months].sort((a, b) => a - b).map(m => MONTHS[m - 1])
  return names.length === 1 ? `hver ${names[0]}` : `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}

export function intervalText(weeks: number, months?: number[] | null): string {
  if (months?.length) return monthsText(months)
  if (weeks === 1) return 'hver uke'
  if (weeks === 2) return 'annenhver uke'
  if (weeks === 26) return 'hvert halvår'
  if (weeks === 52) return 'hvert år'
  if (weeks % 52 === 0) return `hvert ${weeks / 52}. år`
  return `hver ${weeks}. uke`
}

export const minutesText = (minutes: number) =>
  minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} t` : minutes > 60 ? `${Math.floor(minutes / 60)} t ${minutes % 60} min` : `${minutes} min`

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

export const DEFAULT_SETTINGS: ChoreSettings = { id: 1, ...seed.settings, cap_today: null, cap_today_on: null }

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
