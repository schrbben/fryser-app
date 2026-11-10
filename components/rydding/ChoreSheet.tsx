'use client'

import {
  PRIORITIES, daysBetween, dueText, intervalText, longDate, redLimitDays, relativeDay, shortDate,
  type ChoreState, type DateString,
} from '@/lib/rydding'
import Sheet from './Sheet'
import { STATUS_STYLE, capitalize, mins } from './styles'

/** Én oppgave: status, knapper og historikk. */
export default function ChoreSheet({ state, roomName, history, today, snoozeTo, onClose, onDone, onDoneOtherDay, onSnooze, onUnsnooze, onEditDate, onAddDate }: {
  state: ChoreState
  roomName: string
  history: DateString[] // nyeste først
  today: DateString
  snoozeTo: DateString
  onClose: () => void
  onDone: () => void
  onDoneOtherDay: () => void
  onSnooze: () => void
  onUnsnooze: () => void
  onEditDate: (date: DateString) => void
  onAddDate: () => void
}) {
  const { chore, status, due, doneToday } = state
  const style = STATUS_STYLE[status]
  const overdue = daysBetween(due, today)
  const redIn = redLimitDays(chore) - overdue
  const snoozedUntil = chore.snoozed_until && chore.snoozed_until > today ? chore.snoozed_until : null

  const explanation =
    status === 'green' ? 'Forfaller etter neste ryddedag.'
      : status === 'yellow' ? 'Forfaller innen neste ryddedag.'
        : status === 'orange' ? `Over frist. Blir rød om ${redIn} ${redIn === 1 ? 'dag' : 'dager'}.`
          : 'Lenge over frist.'

  return (
    <Sheet
      title={chore.name}
      subtitle={`${roomName} · ${intervalText(chore.interval_weeks, chore.fixed_months)} · ${mins(chore.est_minutes)} · ${PRIORITIES[chore.priority].name} viktighet`}
      onClose={onClose}
    >
      <div className={`rounded-2xl border px-4 py-3 ${doneToday ? 'border-emerald-200 bg-emerald-50' : style.soft}`}>
        {doneToday ? (
          <p className="font-bold text-emerald-700">✓ Gjort i dag</p>
        ) : (
          <p className={`font-bold ${style.text}`}>{dueText(due, today)}</p>
        )}
        <p className="mt-0.5 text-sm text-slate-600">
          {doneToday ? `Neste frist: ${longDate(due, today)}.` : `${explanation} Fristen er ${longDate(due, today)}.`}
        </p>
        {snoozedUntil && (
          <p className="mt-1 text-sm text-slate-600">
            Utsatt til {longDate(snoozedUntil, today)}.{' '}
            <button onClick={onUnsnooze} className="font-semibold text-violet-700 underline underline-offset-2">
              Angre utsettelse
            </button>
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {!doneToday && (
          <button onClick={onDone} className="col-span-2 rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700">
            ✓ Gjort i dag
          </button>
        )}
        <button onClick={onDoneOtherDay} className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700">
          📅 Gjort en annen dag
        </button>
        {!doneToday && !snoozedUntil ? (
          <button onClick={onSnooze} className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700">
            ⏭ Utsett til {shortDate(snoozeTo, today)}
          </button>
        ) : (
          <span />
        )}
      </div>

      {chore.notes && (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{chore.notes}</p>
      )}

      <h3 className="mt-5 text-sm font-semibold text-slate-700">Historikk</h3>
      {history.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {history.map(date => (
            <li key={date} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-sm">
                <span className="font-semibold text-slate-800">{capitalize(longDate(date, today))}</span>
                <span className="block text-xs text-slate-500">{capitalize(relativeDay(date, today))}</span>
              </span>
              <button onClick={() => onEditDate(date)} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50">
                Endre
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          Ikke registrert ennå.{chore.initial_due ? ` Første frist er satt til ${longDate(chore.initial_due, today)}, så ikke alt forfaller samtidig.` : ''}
        </p>
      )}
      <button onClick={onAddDate} className="mt-2 text-sm font-semibold text-violet-700">
        + Legg til en dato
      </button>
    </Sheet>
  )
}
