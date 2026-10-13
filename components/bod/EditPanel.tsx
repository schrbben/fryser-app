'use client'

import { boxName, type StorageBox } from '@/lib/storage'

// Plassen panelet tar, så 3D-visningen kan flyttes unna (stripe nederst på mobil, panel til høyre på PC)
export const EDIT_PANEL = { height: 150, width: 320 }

const BUTTON = 'rounded-xl bg-white/10 hover:bg-white/15 py-2 text-sm font-semibold'

export default function EditPanel({ wide, selected, moving, canRotate, onDone, onAdd, onMap, onEdit, onMove, onCancelMove, onRotate, onRemove, onDeselect }: {
  wide: boolean
  selected: StorageBox | null
  moving: boolean
  canRotate: boolean
  onDone: () => void
  onAdd: () => void
  onMap: () => void
  onEdit: () => void
  onMove: () => void
  onCancelMove: () => void
  onRotate: () => void
  onRemove: () => void
  onDeselect: () => void
}) {
  const title = !selected ? (
    '✏️ Redigerer boden'
  ) : (
    <>
      {moving ? 'Flytter: ' : 'Valgt: '}
      <span className="text-sky-300">{boxName(selected)}</span>
    </>
  )

  const help = !selected
    ? 'Trykk på noe for å velge det, eller på en ledig plass (+) for å legge til noe nytt.'
    : moving
      ? 'Trykk der den skal stå: en ledig plass (+), på gulvet, eller på en annen boks for å bytte plass eller sette den oppå.'
      : 'Velg hva du vil gjøre. Trykk på noe annet for å velge det i stedet.'

  const buttons = !selected ? (
    <>
      <button onClick={onAdd} className={BUTTON}>
        + Legg til
      </button>
      <button onClick={onMap} className={BUTTON}>
        🗺️ Kart
      </button>
    </>
  ) : moving ? (
    <>
      <button onClick={onCancelMove} className={BUTTON}>
        Avbryt flytting
      </button>
      <button onClick={onMap} className={BUTTON}>
        🗺️ Kart
      </button>
    </>
  ) : (
    <>
      <button onClick={onEdit} className={BUTTON}>
        Endre
      </button>
      <button onClick={onMove} className={BUTTON}>
        ↔ Flytt
      </button>
      {canRotate && (
        <button onClick={onRotate} className={BUTTON}>
          ⟳ Roter
        </button>
      )}
      <button onClick={onRemove} className={`${BUTTON} text-red-300`}>
        Fjern
      </button>
    </>
  )

  const columns = selected && !moving ? (canRotate ? 'grid-cols-4' : 'grid-cols-3') : 'grid-cols-2'

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm font-bold text-amber-300">{title}</p>
      {selected && !moving && (
        <button onClick={onDeselect} aria-label="Velg bort" className="ml-auto flex-shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-sm font-semibold">
          ✕
        </button>
      )}
      <button onClick={onDone} className="flex-shrink-0 rounded-lg bg-amber-400 px-3 py-1 text-sm font-bold text-stone-900">
        Ferdig
      </button>
    </div>
  )

  if (wide) {
    return (
      <aside
        className={`absolute right-0 top-0 bottom-0 z-20 flex flex-col gap-4 border-l p-5 text-white ${moving ? 'border-sky-400/50 bg-sky-950/95' : 'border-white/10 bg-stone-900/95'}`}
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
      <div className={`mx-auto max-w-md rounded-2xl px-3.5 py-3 text-white shadow-xl backdrop-blur ${moving ? 'bg-sky-950/95 ring-1 ring-sky-400/50' : 'bg-stone-900/95'}`}>
        {header}
        <p className="mt-1.5 min-h-[2.5em] text-xs leading-snug text-stone-300 line-clamp-2">{help}</p>
        <div className={`mt-2 grid gap-2 ${columns}`}>{buttons}</div>
      </div>
    </div>
  )
}
