'use client'

import { useState } from 'react'
import {
  MONTHS, PRIORITIES, PRIORITY_ORDER, addDays, intervalText, longDate, redLimitDays,
  type Chore, type ChoreRoom, type DateString,
} from '@/lib/rydding'
import Sheet from './Sheet'
import { capitalize } from './styles'

export type ChoreDraft = Pick<Chore, 'name' | 'room_id' | 'interval_weeks' | 'priority' | 'est_minutes' | 'fixed_months' | 'purchase_item' | 'notes'>

const INTERVALS = [1, 2, 4, 8, 12, 26, 52]
const MINUTES = [5, 10, 15, 20, 30, 45, 60]

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`

const label = 'block text-sm font-semibold text-slate-700'
const input = 'mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base font-normal text-slate-900'

/** Ny oppgave eller endre en som finnes. */
export default function ChoreEditor({ initial, rooms, isNew, today, stacked = false, onSave, onArchive, onCancel }: {
  initial: ChoreDraft
  rooms: ChoreRoom[]
  isNew: boolean
  today: DateString
  stacked?: boolean
  onSave: (draft: ChoreDraft, lastDone: DateString | null) => void
  onArchive?: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [lastDone, setLastDone] = useState<DateString>('')
  const [tried, setTried] = useState(false)
  const set = <K extends keyof ChoreDraft>(key: K, value: ChoreDraft[K]) => setDraft(d => ({ ...d, [key]: value }))

  const months = draft.fixed_months ?? []
  const toggleMonth = (month: number) => {
    const next = months.includes(month) ? months.filter(m => m !== month) : [...months, month].sort((a, b) => a - b)
    set('fixed_months', next.length ? next : null)
  }

  const name = draft.name.trim()
  const problem = !name
    ? 'Gi oppgaven et navn.'
    : !draft.room_id
      ? 'Velg et rom.'
      : !(draft.interval_weeks >= 1 && draft.interval_weeks <= 520)
        ? 'Intervallet må være mellom 1 og 520 uker.'
        : !(draft.est_minutes >= 1 && draft.est_minutes <= 600)
          ? 'Tiden må være mellom 1 og 600 minutter.'
          : lastDone && lastDone > today
            ? '«Sist gjort» kan ikke være frem i tid.'
            : null

  const save = () => {
    setTried(true)
    if (problem) return
    onSave(
      {
        ...draft,
        name,
        purchase_item: draft.purchase_item?.trim() || null,
        notes: draft.notes?.trim() || null,
      },
      isNew && lastDone ? lastDone : null,
    )
  }

  const red = redLimitDays({ ...draft, interval_weeks: Math.max(1, draft.interval_weeks || 1) } as Chore)

  return (
    <Sheet
      title={isNew ? 'Ny oppgave' : 'Endre oppgaven'}
      onClose={onCancel}
      stacked={stacked}
      footer={
        <>
          {problem && (tried || !isNew) && <p className="mb-2 text-sm text-red-600">{problem}</p>}
          <div className="flex gap-2">
            <button onClick={save} className={`flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white ${problem ? 'opacity-50' : ''}`}>
              {isNew ? 'Legg til' : 'Lagre'}
            </button>
            <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
              Avbryt
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-5">
        <label className={label}>
          Navn
          <input className={input} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="F.eks. Vaske kjøleskapet" autoFocus={isNew} />
        </label>

        <div>
          <span className={label}>Rom</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {rooms.map(room => (
              <button key={room.id} onClick={() => set('room_id', room.id)} className={chip(draft.room_id === room.id)}>
                {room.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={label}>Hvor ofte</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {INTERVALS.map(weeks => (
              <button key={weeks} onClick={() => set('interval_weeks', weeks)} className={chip(draft.interval_weeks === weeks)}>
                {capitalize(intervalText(weeks))}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <span>Hver</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={520}
              value={Number.isFinite(draft.interval_weeks) ? draft.interval_weeks : ''}
              onChange={e => set('interval_weeks', parseInt(e.target.value, 10))}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base text-slate-900"
              aria-label="Intervall i uker"
            />
            <span>. uke</span>
          </div>
        </div>

        <div>
          <span className={label}>Faste måneder <span className="font-normal text-slate-500">(valgfritt)</span></span>
          <p className="text-xs text-slate-500">
            Velger du måneder, forfaller oppgaven første ryddedag i neste valgte måned, for eksempel vinduer i april og oktober.
          </p>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {MONTHS.map((month, i) => (
              <button key={month} onClick={() => toggleMonth(i + 1)} aria-pressed={months.includes(i + 1)} className={`${chip(months.includes(i + 1))} px-0`}>
                {capitalize(month.slice(0, 3))}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={label}>Viktighet</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {PRIORITY_ORDER.map(p => (
              <button key={p} onClick={() => set('priority', p)} className={`${chip(draft.priority === p)} rounded-xl py-2`}>
                {PRIORITIES[p].name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Blir rød {red} {red === 1 ? 'dag' : 'dager'} over frist, og tas da med selv om tiden ikke strekker til.
          </p>
        </div>

        <div>
          <span className={label}>Tid <span className="font-normal text-slate-500">(aktiv innsats)</span></span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MINUTES.map(m => (
              <button key={m} onClick={() => set('est_minutes', m)} className={chip(draft.est_minutes === m)}>
                {m} min
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={Number.isFinite(draft.est_minutes) ? draft.est_minutes : ''}
              onChange={e => set('est_minutes', parseInt(e.target.value, 10))}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base text-slate-900"
              aria-label="Tid i minutter"
            />
            <span>minutter</span>
          </div>
        </div>

        <label className={label}>
          Innkjøp <span className="font-normal text-slate-500">(valgfritt)</span>
          <input
            className={input}
            value={draft.purchase_item ?? ''}
            onChange={e => set('purchase_item', e.target.value)}
            placeholder="F.eks. Rensetabletter"
          />
        </label>

        <label className={label}>
          Notat <span className="font-normal text-slate-500">(valgfritt)</span>
          <textarea
            className={`${input} min-h-[5rem]`}
            value={draft.notes ?? ''}
            onChange={e => set('notes', e.target.value)}
            placeholder="F.eks. filtertype eller hvordan det gjøres"
          />
        </label>

        {isNew && (
          <div>
            <span className={label}>Sist gjort <span className="font-normal text-slate-500">(valgfritt)</span></span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button onClick={() => setLastDone('')} className={chip(!lastDone)}>Vet ikke</button>
              <button onClick={() => setLastDone(today)} className={chip(lastDone === today)}>I dag</button>
              <button onClick={() => setLastDone(addDays(today, -1))} className={chip(lastDone === addDays(today, -1))}>I går</button>
            </div>
            <input type="date" max={today} value={lastDone} onChange={e => setLastDone(e.target.value)} className={input} aria-label="Sist gjort" />
            <p className="mt-1 text-xs text-slate-500">
              {lastDone && lastDone <= today
                ? `Registreres som gjort ${longDate(lastDone, today)}.`
                : 'Vet du ikke, får den en frist i uka med minst å gjøre.'}
            </p>
          </div>
        )}
      </div>

      {onArchive && (
        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3">
          <p className="text-sm text-slate-600">Arkiverte oppgaver forsvinner fra forslagene, men historikken beholdes og de kan hentes tilbake under ⚙️.</p>
          <button onClick={onArchive} className="mt-2 text-sm font-semibold text-red-600">
            Arkiver oppgaven
          </button>
        </div>
      )}
    </Sheet>
  )
}
