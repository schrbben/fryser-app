'use client'

import { dueText, intervalText, type ChoreState, type DateString } from '@/lib/rydding'
import { STATUS_STYLE, mins } from './styles'

export default function ChoreRow({ state, roomName, today, onOpen, onDone, onUndo }: {
  state: ChoreState
  roomName: string
  today: DateString
  onOpen: () => void
  onDone: () => void
  onUndo: () => void
}) {
  const { chore, status, due, early, doneToday, snoozed, forced } = state
  const style = STATUS_STYLE[status]

  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <span className={`w-1.5 flex-shrink-0 ${doneToday ? 'bg-emerald-500' : style.bar}`} aria-hidden />
      <button onClick={onOpen} className="min-w-0 flex-1 px-3 py-2.5 text-left">
        <span className={`block font-semibold leading-snug ${doneToday ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}>
          {chore.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {roomName} · {intervalText(chore.interval_weeks, chore.fixed_months)} · {mins(chore.est_minutes)}
        </span>
        {!doneToday && (
          <span className={`mt-0.5 block text-xs font-semibold ${style.text}`}>
            {dueText(due, today)}
            {early && <span className="font-normal text-slate-500"> · kan tas tidlig</span>}
            {forced && <span className="font-normal text-slate-500"> · tatt med over tiden</span>}
            {snoozed && <span className="font-normal text-slate-500"> · utsatt</span>}
          </span>
        )}
      </button>
      {doneToday ? (
        <button onClick={onUndo} className="flex-shrink-0 px-4 text-sm font-semibold text-slate-500 hover:text-slate-700">
          Angre
        </button>
      ) : (
        <button
          onClick={onDone}
          aria-label={`Merk «${chore.name}» som gjort i dag`}
          className="mr-2.5 flex-shrink-0 self-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200"
        >
          ✓ Gjort
        </button>
      )}
    </li>
  )
}
