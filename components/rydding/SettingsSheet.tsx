'use client'

import { useState } from 'react'
import { WEEKDAYS, WEEKDAY_ORDER, minutesText, type ChoreSettings } from '@/lib/rydding'
import Sheet from './Sheet'
import { capitalize } from './styles'

export default function SettingsSheet({ settings, onSave, onCancel }: {
  settings: ChoreSettings
  onSave: (fields: Pick<ChoreSettings, 'cleaning_weekday' | 'cap_minutes'>) => void
  onCancel: () => void
}) {
  const [weekday, setWeekday] = useState(settings.cleaning_weekday)
  const [cap, setCap] = useState(settings.cap_minutes)
  const step = (delta: number) => setCap(m => Math.min(600, Math.max(15, m + delta)))

  return (
    <Sheet title="Innstillinger" subtitle="Gjelder for dere begge" onClose={onCancel}>
      <h3 className="text-sm font-semibold text-slate-700">Ryddedag</h3>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {WEEKDAY_ORDER.map(day => (
          <button
            key={day}
            onClick={() => setWeekday(day)}
            aria-label={capitalize(WEEKDAYS[day])}
            aria-pressed={weekday === day}
            className={`rounded-xl border py-2 text-sm font-semibold ${
              weekday === day ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {capitalize(WEEKDAYS[day].slice(0, 3))}
          </button>
        ))}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-700">Vanlig tid per ryddedag</h3>
      <div className="mt-2 flex items-center gap-4">
        <button onClick={() => step(-15)} aria-label="15 minutter mindre" className="h-11 w-11 rounded-full bg-slate-100 text-xl font-bold text-slate-700">
          −
        </button>
        <div className="min-w-[6rem] text-center">
          <span className="text-2xl font-extrabold tabular-nums">{cap}</span>
          <span className="ml-1 font-semibold text-slate-500">min</span>
          <span className="block text-xs text-slate-500">{minutesText(cap)}</span>
        </div>
        <button onClick={() => step(15)} aria-label="15 minutter mer" className="h-11 w-11 rounded-full bg-slate-100 text-xl font-bold text-slate-700">
          +
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Har dere mer eller mindre tid én dag, bruk heller «Endre tid i dag».</p>

      <div className="mt-5 flex gap-2">
        <button onClick={() => onSave({ cleaning_weekday: weekday, cap_minutes: cap })} className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white">
          Lagre
        </button>
        <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
          Avbryt
        </button>
      </div>
    </Sheet>
  )
}
