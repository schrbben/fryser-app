'use client'

import { KINDS, LEVEL_NAMES, SHELF_NAMES, SHELVES, SLOTS, boxInSlot, boxName, childOf, levelsTopDown, spanOf, type Slot, type StorageBox } from '@/lib/storage'

export default function ShelfMap({ boxes, itemCounts, highlightIds, editMode, selectedId, moving, onPickSlot, onPickBox, onClose }: {
  boxes: StorageBox[]
  itemCounts: Map<string, number>
  highlightIds: Set<string>
  editMode: boolean
  selectedId: string | null
  moving: boolean
  onPickSlot: (slot: Slot) => void
  onPickBox: (box: StorageBox) => void
  onClose: () => void
}) {
  const selected = boxes.find(b => b.id === selectedId) ?? null
  const floor = boxes.filter(b => b.placement === 'floor')
  const elsewhere = boxes.filter(b => b.placement === 'elsewhere')

  const colorClass = (box: StorageBox) =>
    box.id === selectedId
      ? 'border-sky-500 bg-sky-100 ring-2 ring-sky-400'
      : highlightIds.has(box.id)
        ? 'border-amber-500 bg-amber-200'
        : box.kind === 'box' && box.color === 'black'
          ? 'border-stone-900 bg-stone-800 text-white'
          : box.kind === 'box' && box.color === 'white'
            ? 'border-stone-300 bg-white'
            : box.kind === 'box'
              ? 'border-sky-200 bg-white/90'
              : 'border-amber-300 bg-amber-50'

  // Det som står oppå, nederst først
  const stackAbove = (box: StorageBox) => {
    const list: StorageBox[] = []
    let current = childOf(boxes, box)
    for (let i = 0; current && i < 10; i++) {
      list.push(current)
      current = childOf(boxes, current)
    }
    return list
  }

  const stackChips = (box: StorageBox) =>
    stackAbove(box).map(above => (
      <button
        key={above.id}
        onClick={() => onPickBox(above)}
        className={`block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-semibold ${colorClass(above)}`}
      >
        ⬆ {boxName(above)}
      </button>
    ))

  const listButton = (box: StorageBox, detail: string) => (
    <div key={box.id} className="space-y-1">
      <button onClick={() => onPickBox(box)} className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${colorClass(box)}`}>
        <span className="text-xl">{KINDS[box.kind].icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">{boxName(box)}</span>
          <span className="block text-xs opacity-70 truncate">{detail}</span>
        </span>
      </button>
      {stackAbove(box).length > 0 && <div className="ml-8 space-y-1">{stackChips(box)}</div>}
    </div>
  )

  const help = !editMode
    ? 'Trykk på noe for å åpne det.'
    : !selected
      ? 'Trykk på noe for å velge det, eller på en ledig plass for å legge til noe nytt.'
      : moving
        ? `Flytter ${boxName(selected)}. Trykk på en ledig plass, eller på en annen boks for å bytte plass eller sette den oppå.`
        : `${boxName(selected)} er valgt. Trykk «Flytt» nederst for å flytte den.`

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-lg font-extrabold">{editMode ? '✏️ Rediger boden' : 'Kart over boden'}</h2>
            <p className="text-xs text-stone-500">{help}</p>
          </div>
          <button onClick={onClose} aria-label="Lukk kartet" className="flex-shrink-0 w-9 h-9 rounded-full bg-stone-100 font-semibold text-stone-600">
            ✕
          </button>
        </div>

        {SHELVES.map(shelf => (
          <section key={shelf} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">{SHELF_NAMES[shelf]}</h3>
            <div className="rounded-2xl bg-[#c9a77c]/25 border border-[#c9a77c]/60 p-1.5 space-y-1.5">
              {levelsTopDown(shelf).map(level => (
                <div key={level}>
                  {level === 4 && <p className="px-1 pb-1 text-[11px] font-semibold text-stone-500">På toppen (bare lave ting)</p>}
                  <div className={`grid grid-cols-4 gap-1.5 ${level === 4 ? 'border-b border-dashed border-[#c9a77c] pb-1.5' : ''}`}>
                    {SLOTS.map(slotNumber => {
                      const slot: Slot = { shelf, level, slot: slotNumber }
                      const box = boxInSlot(boxes, slot)
                      // Det som tar to plasser tegnes én gang, fra plassen det starter på
                      if (box && box.slot !== slotNumber) return null
                      if (!box) {
                        return (
                          <button
                            key={slotNumber}
                            onClick={() => onPickSlot(slot)}
                            disabled={!editMode}
                            className={`rounded-xl border border-dashed border-stone-300 text-xs text-stone-400 enabled:hover:bg-white/60 ${level === 4 ? 'h-[52px]' : 'h-[76px]'}`}
                          >
                            {editMode ? '+ Ledig' : 'Ledig'}
                          </button>
                        )
                      }
                      const count = itemCounts.get(box.id) ?? 0
                      return (
                        <div key={slotNumber} className={`flex flex-col gap-1 ${spanOf(box) > 1 ? 'col-span-2' : ''}`}>
                          <button
                            onClick={() => onPickBox(box)}
                            title={`${LEVEL_NAMES[level]}, plass ${slotNumber}`}
                            className={`flex-1 min-h-[48px] rounded-xl border text-left px-2 py-1.5 transition-colors ${colorClass(box)}`}
                          >
                            <span className="block text-lg font-extrabold leading-none truncate">
                              {box.kind === 'box' && box.number != null ? box.number : KINDS[box.kind].icon}
                            </span>
                            <span className="block text-[11px] leading-tight truncate mt-1 opacity-80">
                              {box.kind === 'box' ? box.label || `${count} ting` : boxName(box)}
                            </span>
                          </button>
                          {stackChips(box)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {floor.length > 0 && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">På gulvet</h3>
            <div className="space-y-1.5">{floor.map(box => listButton(box, `${itemCounts.get(box.id) ?? 0} ting`))}</div>
          </section>
        )}

        {elsewhere.length > 0 && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">Utenfor boden</h3>
            <div className="space-y-1.5">
              {elsewhere.map(box => listButton(box, `${box.location || 'Annet sted'} · ${itemCounts.get(box.id) ?? 0} ting`))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
