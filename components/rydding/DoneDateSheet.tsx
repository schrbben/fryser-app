'use client'

import { useState } from 'react'
import { addDays, longDate, type DateString } from '@/lib/rydding'
import Sheet from './Sheet'
import { capitalize } from './styles'

/** Velg datoen en oppgave ble gjort. Standard er i dag. */
export default function DoneDateSheet({ choreName, initial, today, existing, onSave, onDelete, onCancel }: {
  choreName: string
  initial: DateString
  today: DateString
  existing: DateString[] // datoer som allerede er registrert (unntatt den som endres)
  onSave: (date: DateString) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(initial)
  const quick: [string, DateString][] = [
    ['I dag', today],
    ['I går', addDays(today, -1)],
    ['I forgårs', addDays(today, -2)],
  ]
  const problem = !date
    ? 'Velg en dato.'
    : date > today
      ? 'Datoen kan ikke være frem i tid.'
      : existing.includes(date)
        ? 'Den datoen er allerede registrert.'
        : null

  return (
    <Sheet title={`Når ble det gjort?`} subtitle={choreName} onClose={onCancel} stacked>
      <div className="flex flex-wrap gap-2">
        {quick.map(([label, value]) => (
          <button
            key={label}
            onClick={() => setDate(value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              date === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Eller velg dato
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base font-normal"
        />
      </label>
      <p className={`mt-2 min-h-[1.25rem] text-sm ${problem ? 'text-red-600' : 'text-slate-500'}`}>
        {problem ?? capitalize(longDate(date, today))}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => !problem && onSave(date)}
          disabled={!!problem}
          className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white disabled:opacity-40"
        >
          Lagre
        </button>
        <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
          Avbryt
        </button>
      </div>
      {onDelete && (
        <button onClick={onDelete} className="mt-3 w-full py-2 text-sm font-semibold text-red-600">
          Slett denne datoen
        </button>
      )}
    </Sheet>
  )
}
