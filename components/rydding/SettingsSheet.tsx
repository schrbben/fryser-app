'use client'

import { useState } from 'react'
import { WEEKDAYS, WEEKDAY_ORDER, minutesText, type ChoreSettings } from '@/lib/rydding'
import PushSettings from './PushSettings'
import Sheet from './Sheet'
import { capitalize } from './styles'

export default function SettingsSheet({ settings, roomCount, archivedCount, neverDoneCount, onSave, onRooms, onArchive, onLastDone, onCancel }: {
  settings: ChoreSettings
  roomCount: number
  archivedCount: number
  neverDoneCount: number
  onSave: (fields: Pick<ChoreSettings, 'cleaning_weekday' | 'cap_minutes' | 'notify_time'>) => void
  onRooms: () => void
  onArchive: () => void
  onLastDone: () => void
  onCancel: () => void
}) {
  const [weekday, setWeekday] = useState(settings.cleaning_weekday)
  const [cap, setCap] = useState(settings.cap_minutes)
  const [notifyTime, setNotifyTime] = useState(settings.notify_time.slice(0, 5))
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

      <h3 className="mt-5 text-sm font-semibold text-slate-700">Varsel på ryddedagen</h3>
      <label className="mt-2 flex items-center gap-3 text-sm text-slate-600">
        Klokka
        <input
          type="time"
          step={900}
          value={notifyTime}
          onChange={e => setNotifyTime(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-base text-slate-900"
        />
      </label>
      <p className="mt-1 text-xs text-slate-500">Varselet kommer innen et kvarter etter klokkeslettet, bare på ryddedagen.</p>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => onSave({ cleaning_weekday: weekday, cap_minutes: cap, notify_time: /^\d\d:\d\d$/.test(notifyTime) ? notifyTime : settings.notify_time })}
          className="flex-1 rounded-xl bg-violet-600 py-3 font-bold text-white"
        >
          Lagre
        </button>
        <button onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">
          Avbryt
        </button>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 px-4 py-3">
        <h3 className="mb-2 font-semibold text-slate-800">🔔 Varsler på denne telefonen</h3>
        <PushSettings />
      </section>

      <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
        <button onClick={onLastDone} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span>
            <span className="block font-semibold text-slate-800">📋 Legg inn sist gjort</span>
            <span className="block text-xs text-slate-500">For oppgaver som aldri er registrert</span>
          </span>
          <span className="text-sm text-slate-500">{neverDoneCount} ›</span>
        </button>
        <button onClick={onRooms} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="font-semibold text-slate-800">🏠 Rom</span>
          <span className="text-sm text-slate-500">{roomCount} ›</span>
        </button>
        <button onClick={onArchive} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="font-semibold text-slate-800">🗄️ Arkiverte oppgaver</span>
          <span className="text-sm text-slate-500">{archivedCount} ›</span>
        </button>
      </div>
    </Sheet>
  )
}
