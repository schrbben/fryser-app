'use client'

import { useState } from 'react'
import {
  addDays, cleaningDayOnOrAfter, dueDate, dueText, intervalText, statusOf,
  type Chore, type ChoreRoom, type ChoreSettings, type DateString,
} from '@/lib/rydding'
import Sheet from './Sheet'
import { STATUS_STYLE } from './styles'

/** Omtrentlige valg, i dager siden i dag. */
const PRESETS: [string, number][] = [
  ['I dag', 0],
  ['I går', 1],
  ['For en uke siden', 7],
  ['For to uker siden', 14],
  ['For tre uker siden', 21],
  ['For en måned siden', 30],
  ['For to måneder siden', 61],
  ['For tre måneder siden', 91],
  ['For fire måneder siden', 122],
  ['For et halvt år siden', 183],
  ['For ni måneder siden', 274],
  ['For et år siden', 365],
  ['For mer enn et år siden', 456],
]

type Choice = { preset: string; date: DateString } // preset: antall dager som tekst, eller 'custom'

/** Oppstart: legg inn når oppgavene sist ble gjort, så godt dere husker. */
export default function LastDoneSheet({ chores, rooms, settings, today, onSave, onCancel }: {
  chores: Chore[] // oppgaver som aldri er registrert
  rooms: ChoreRoom[]
  settings: ChoreSettings
  today: DateString
  onSave: (dates: Map<string, DateString>) => void
  onCancel: () => void
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const nextCleaningDay = cleaningDayOnOrAfter(today, settings.cleaning_weekday)

  const groups = rooms
    .map(room => ({
      room,
      chores: chores
        .filter(c => c.room_id === room.id)
        .sort((a, b) => a.interval_weeks - b.interval_weeks || a.name.localeCompare(b.name, 'nb')),
    }))
    .filter(g => g.chores.length > 0)

  const choose = (id: string, preset: string) =>
    setChoices(current => {
      const next = { ...current }
      if (!preset) delete next[id]
      else next[id] = { preset, date: preset === 'custom' ? current[id]?.date ?? today : addDays(today, -Number(preset)) }
      return next
    })

  const setDate = (id: string, date: DateString) => setChoices(current => ({ ...current, [id]: { preset: 'custom', date } }))

  const valid = Object.entries(choices).filter(([, c]) => c.date && c.date <= today)
  const save = () => onSave(new Map(valid.map(([id, c]) => [id, c.date])))

  return (
    <Sheet
      title="Når ble det sist gjort?"
      subtitle="Legg inn det dere husker. Resten fordeles utover ukene, så ikke alt kommer samtidig."
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <button onClick={save} disabled={valid.length === 0} className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white disabled:opacity-40">
            {valid.length === 0 ? 'Lagre' : `Lagre ${valid.length} ${valid.length === 1 ? 'dato' : 'datoer'}`}
          </button>
          <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
            Avbryt
          </button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">Alle oppgavene har allerede en dato. Du kan endre historikken på hver oppgave.</p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ room, chores: list }) => (
            <section key={room.id}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{room.name}</h3>
              <ul className="mt-1 divide-y divide-slate-100">
                {list.map(chore => {
                  const choice = choices[chore.id]
                  const due = choice?.date && choice.date <= today ? dueDate(chore, choice.date, settings.cleaning_weekday) : null
                  const status = due ? statusOf(chore, due, today, nextCleaningDay) : null
                  return (
                    <li key={chore.id} className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-slate-800">{chore.name}</p>
                          <p className="text-xs text-slate-500">{intervalText(chore.interval_weeks, chore.fixed_months)}</p>
                        </div>
                        <select
                          value={choice?.preset ?? ''}
                          onChange={e => choose(chore.id, e.target.value)}
                          aria-label={`Sist gjort: ${chore.name}`}
                          className={`w-[9.5rem] flex-shrink-0 rounded-lg border px-2 py-2 text-sm ${
                            choice ? 'border-violet-300 bg-violet-50 font-semibold text-violet-900' : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          <option value="">Vet ikke</option>
                          {PRESETS.map(([label, days]) => (
                            <option key={days} value={String(days)}>{label}</option>
                          ))}
                          <option value="custom">Velg dato …</option>
                        </select>
                      </div>
                      {choice?.preset === 'custom' && (
                        <input
                          type="date"
                          max={today}
                          value={choice.date}
                          onChange={e => setDate(chore.id, e.target.value)}
                          aria-label={`Dato for ${chore.name}`}
                          className="mt-2 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base"
                        />
                      )}
                      {due && status && (
                        <p className={`mt-1 text-xs font-semibold ${STATUS_STYLE[status].text}`}>→ {dueText(due, today)}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  )
}
