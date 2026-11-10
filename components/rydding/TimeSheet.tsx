'use client'

import { useState } from 'react'
import { WEEKDAYS, minutesText, type DateString } from '@/lib/rydding'
import Sheet from './Sheet'

const QUICK = [30, 60, 90, 105, 150, 180, 240]

/** Annen tid enn vanlig, bare for i dag. */
export default function TimeSheet({ current, normal, active, today, nextCleaningDay, cleaningWeekday, onSave, onReset, onCancel }: {
  current: number
  normal: number
  active: boolean
  today: DateString
  nextCleaningDay: DateString
  cleaningWeekday: number
  onSave: (minutes: number) => void
  onReset: () => void
  onCancel: () => void
}) {
  const [minutes, setMinutes] = useState(current)
  const step = (delta: number) => setMinutes(m => Math.min(600, Math.max(15, m + delta)))
  const isCleaningDay = today === nextCleaningDay

  return (
    <Sheet title="Hvor mye tid har dere i dag?" onClose={onCancel}>
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => step(-15)} aria-label="15 minutter mindre" className="h-12 w-12 rounded-full bg-slate-100 text-2xl font-bold text-slate-700">
          −
        </button>
        <div className="min-w-[8rem] text-center">
          <span className="text-4xl font-extrabold tabular-nums text-slate-900">{minutes}</span>
          <span className="ml-1 text-lg font-semibold text-slate-500">min</span>
          <span className="block text-xs text-slate-500">{minutesText(minutes)}</span>
        </div>
        <button onClick={() => step(15)} aria-label="15 minutter mer" className="h-12 w-12 rounded-full bg-slate-100 text-2xl font-bold text-slate-700">
          +
        </button>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {QUICK.map(value => (
          <button
            key={value}
            onClick={() => setMinutes(value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              minutes === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {value === normal ? `${value} (vanlig)` : value}
          </button>
        ))}
      </div>

      <p className="mt-4 rounded-xl bg-violet-50 px-3 py-2.5 text-sm text-violet-900">
        {isCleaningDay
          ? `Gjelder bare ryddedagen i dag. Forslaget fylles først med det som ikke fikk plass, så med det som snart skal gjøres. Neste ${WEEKDAYS[cleaningWeekday]} er det vanlig tid igjen (${normal} min).`
          : `Du får forslag til hva som kan gjøres i dag: først det som er over frist, så det som snart skal gjøres. Det gjelder bare i dag, og ${WEEKDAYS[cleaningWeekday]} er det vanlig ryddedag med ${normal} min.`}
      </p>

      <div className="mt-4 flex gap-2">
        <button onClick={() => onSave(minutes)} className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white">
          Bruk i dag
        </button>
        <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
          Avbryt
        </button>
      </div>
      {active && (
        <button onClick={onReset} className="mt-3 w-full py-2 text-sm font-semibold text-violet-700">
          Tilbake til vanlig tid
        </button>
      )}
    </Sheet>
  )
}
