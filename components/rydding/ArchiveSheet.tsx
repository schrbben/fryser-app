'use client'

import { intervalText, shortDate, type Chore, type DateString } from '@/lib/rydding'
import Sheet from './Sheet'

/** Arkiverte oppgaver beholder historikken og kan hentes tilbake. */
export default function ArchiveSheet({ chores, roomName, lastDone, today, onRestore, onClose }: {
  chores: Chore[]
  roomName: (id: string) => string
  lastDone: Map<string, DateString>
  today: DateString
  onRestore: (chore: Chore) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Arkiverte oppgaver" subtitle="Historikken er tatt vare på." onClose={onClose}>
      {chores.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen arkiverte oppgaver.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {chores.map(chore => {
            const last = lastDone.get(chore.id)
            return (
              <li key={chore.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800">{chore.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {roomName(chore.room_id)} · {intervalText(chore.interval_weeks, chore.fixed_months)} ·{' '}
                    {last ? `sist gjort ${shortDate(last, today)}` : 'aldri registrert'}
                  </span>
                </span>
                <button onClick={() => onRestore(chore)} className="flex-shrink-0 rounded-lg bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">
                  Hent tilbake
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
