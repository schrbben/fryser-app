'use client'

import { dueText, type ChoreState, type DateString } from '@/lib/rydding'

/** Varer som trengs til oppgaver som forfaller den neste uka. */
export default function ShoppingList({ items, today, onBought, onOpen }: {
  items: ChoreState[]
  today: DateString
  onBought: (state: ChoreState) => void
  onOpen: (state: ChoreState) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" aria-label="Handleliste">
      <h2 className="text-sm font-bold text-amber-900">🛒 Handleliste</h2>
      <ul className="mt-1.5 space-y-1.5">
        {items.map(state => (
          <li key={state.chore.id} className="flex items-center gap-3">
            <button
              onClick={() => onBought(state)}
              aria-label={`Merk ${state.chore.purchase_item} som kjøpt`}
              title="Kjøpt"
              className="h-7 w-7 flex-shrink-0 rounded-lg border-2 border-amber-400 bg-white hover:bg-amber-100"
            />
            <button onClick={() => onOpen(state)} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold text-slate-800">{state.chore.purchase_item}</span>
              <span className="block truncate text-xs text-slate-600">
                Til «{state.chore.name}» · {dueText(state.due, today).toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
