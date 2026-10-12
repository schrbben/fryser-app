'use client'

import { KINDS, LEVELS_TOP_DOWN, LEVEL_NAMES, SHELF_NAMES, SHELVES, SLOTS, boxInSlot, boxName, slotSpan, type Slot, type StorageBox } from '@/lib/storage'

export default function ShelfMap({ boxes, itemCounts, highlightIds, editMode, selectedId, onPickSlot, onPickBox, onClose }: {
  boxes: StorageBox[]
  itemCounts: Map<string, number>
  highlightIds: Set<string>
  editMode: boolean
  selectedId: string | null
  onPickSlot: (slot: Slot) => void
  onPickBox: (box: StorageBox) => void
  onClose: () => void
}) {
  const selected = boxes.find(b => b.id === selectedId) ?? null
  const floor = boxes.filter(b => b.placement === 'floor')
  const elsewhere = boxes.filter(b => b.placement === 'elsewhere')

  const cellClass = (box: StorageBox) =>
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

  const listButton = (box: StorageBox, detail: string) => (
    <button
      key={box.id}
      onClick={() => onPickBox(box)}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${cellClass(box)}`}
    >
      <span className="text-xl">{KINDS[box.kind].icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{boxName(box)}</span>
        <span className="block text-xs opacity-70 truncate">{detail}</span>
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-lg font-extrabold">{editMode ? '✏️ Rediger boden' : 'Kart over boden'}</h2>
            <p className="text-xs text-stone-500">
              {!editMode
                ? 'Trykk på noe for å åpne det.'
                : selected
                  ? slotSpan(selected.kind) > 1
                    ? `${boxName(selected)} er valgt. Trykk på en ledig plass for å flytte den. Den tar to plasser.`
                    : `${boxName(selected)} er valgt. Trykk på en ledig plass for å flytte den, eller på en annen boks i hylla for å bytte plass.`
                  : 'Trykk på noe for å velge det, eller på en ledig plass for å legge til noe nytt.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Lukk kartet" className="flex-shrink-0 w-9 h-9 rounded-full bg-stone-100 font-semibold text-stone-600">
            ✕
          </button>
        </div>

        {SHELVES.map(shelf => (
          <section key={shelf} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">{SHELF_NAMES[shelf]}</h3>
            <div className="rounded-2xl bg-[#c9a77c]/25 border border-[#c9a77c]/60 p-1.5 space-y-1.5">
              {LEVELS_TOP_DOWN.map(level => (
                <div key={level} className="grid grid-cols-4 gap-1.5">
                  {SLOTS.map(slotNumber => {
                    const slot: Slot = { shelf, level, slot: slotNumber }
                    const box = boxInSlot(boxes, slot)
                    // En koffert dekker to ruter og tegnes én gang, fra plassen den starter på
                    if (box && box.slot !== slotNumber) return null
                    const count = box ? itemCounts.get(box.id) ?? 0 : 0
                    return box ? (
                      <button
                        key={slotNumber}
                        onClick={() => onPickBox(box)}
                        title={`${LEVEL_NAMES[level]}, plass ${slotNumber}`}
                        className={`h-[68px] rounded-xl border text-left px-2 py-1.5 transition-colors ${slotSpan(box.kind) > 1 ? 'col-span-2' : ''} ${cellClass(box)}`}
                      >
                        <span className="block text-xl font-extrabold leading-none truncate">
                          {box.kind === 'box' && box.number != null ? box.number : KINDS[box.kind].icon}
                        </span>
                        <span className="block text-[11px] leading-tight truncate mt-1 opacity-80">
                          {box.kind === 'box' ? box.label || `${count} ting` : boxName(box)}
                        </span>
                      </button>
                    ) : (
                      <button
                        key={slotNumber}
                        onClick={() => onPickSlot(slot)}
                        disabled={!editMode}
                        className="h-[68px] rounded-xl border border-dashed border-stone-300 text-xs text-stone-400 enabled:hover:bg-white/60"
                      >
                        {editMode ? '+ Ledig' : 'Ledig'}
                      </button>
                    )
                  })}
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
