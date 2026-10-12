'use client'

import { boxName, slotSpan, type StorageBox } from '@/lib/storage'

// Plassen panelet tar, så 3D-visningen kan flyttes unna (stripe nederst på mobil, panel til høyre på PC)
export const EDIT_PANEL = { height: 150, width: 320 }

const BUTTON = 'rounded-xl bg-white/10 hover:bg-white/15 py-2 text-sm font-semibold'

export default function EditPanel({ wide, selected, onDone, onAdd, onMap, onEdit, onRotate, onDeselect, onRemove }: {
  wide: boolean
  selected: StorageBox | null
  onDone: () => void
  onAdd: () => void
  onMap: () => void
  onEdit: () => void
  onRotate: () => void
  onDeselect: () => void
  onRemove: () => void
}) {
  const wideItem = selected !== null && slotSpan(selected.kind) > 1
  const help = selected
    ? `Trykk på en ledig plass (+)${wideItem ? ', den tar to plasser,' : ''} eller på gulvet for å flytte den${
        selected.placement === 'shelf' && !wideItem ? ', eller på en annen boks for å bytte plass' : ''
      }.`
    : 'Trykk på noe for å velge det. Trykk på en ledig plass (+) eller på gulvet for å legge til noe nytt.'

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm font-bold text-amber-300">
        {selected ? (
          <>
            Valgt: <span className="text-sky-300">{boxName(selected)}</span>
          </>
        ) : (
          '✏️ Redigerer boden'
        )}
      </p>
      <button onClick={onDone} className="flex-shrink-0 rounded-lg bg-amber-400 px-3 py-1 text-sm font-bold text-stone-900">
        Ferdig
      </button>
    </div>
  )

  const buttons = selected ? (
    <>
      <button onClick={onEdit} className={BUTTON}>
        Endre
      </button>
      {selected.placement === 'floor' ? (
        <button onClick={onRotate} className={BUTTON}>
          ⟳ Snu
        </button>
      ) : (
        <button onClick={onDeselect} className={BUTTON}>
          Avbryt
        </button>
      )}
      <button onClick={onRemove} className={`${BUTTON} text-red-300`}>
        Fjern
      </button>
    </>
  ) : (
    <>
      <button onClick={onAdd} className={BUTTON}>
        + Legg til
      </button>
      <button onClick={onMap} className={BUTTON}>
        🗺️ Kart
      </button>
    </>
  )

  if (wide) {
    return (
      <aside
        className="absolute right-0 top-0 bottom-0 z-20 flex flex-col gap-4 border-l border-white/10 bg-stone-900/95 p-5 text-white"
        style={{ width: EDIT_PANEL.width }}
      >
        {header}
        <p className="text-sm text-stone-300">{help}</p>
        <div className="grid gap-2">{buttons}</div>
      </aside>
    )
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="mx-auto max-w-md rounded-2xl bg-stone-900/95 px-3.5 py-3 text-white shadow-xl backdrop-blur">
        {header}
        <p className="mt-1.5 min-h-[2.5em] text-xs leading-snug text-stone-300 line-clamp-2">{help}</p>
        <div className={`mt-2 grid gap-2 ${selected ? 'grid-cols-3' : 'grid-cols-2'}`}>{buttons}</div>
      </div>
    </div>
  )
}
