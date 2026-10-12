'use client'

import { useEffect, useState } from 'react'
import { COLORS, KINDS, boxLabelSuffix, boxName, describePlacement, normalize, type StorageBox, type StorageItem } from '@/lib/storage'

export default function BoxSheet({ box, items, query, wide, height, onClose, onAddItem, onRemoveItem, onRenameItem, onEdit, onMove }: {
  box: StorageBox
  items: StorageItem[]
  query: string
  wide: boolean
  height: number
  onClose: () => void
  onAddItem: (name: string) => void
  onRemoveItem: (item: StorageItem) => void
  onRenameItem: (item: StorageItem, name: string) => void
  onEdit: () => void
  onMove: () => void
}) {
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const q = normalize(query)
  const suffix = boxLabelSuffix(box)
  const typeText = box.kind === 'box' ? `${COLORS[box.color]?.label.toLowerCase() ?? ''} boks` : KINDS[box.kind].name.toLowerCase()

  useEffect(() => {
    setNewItem('')
    setEditingId(null)
  }, [box.id])

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newItem.trim()
    if (!name) return
    onAddItem(name)
    setNewItem('')
  }

  const startRename = (item: StorageItem) => {
    setEditingId(item.id)
    setEditingName(item.name)
  }

  const finishRename = (item: StorageItem) => {
    const name = editingName.trim()
    if (name && name !== item.name) onRenameItem(item, name)
    setEditingId(null)
  }

  return (
    <section
      className={`absolute z-30 bg-white text-stone-900 shadow-2xl flex flex-col ${
        wide ? 'right-0 top-0 bottom-0 w-[400px] border-l border-stone-200' : 'inset-x-0 bottom-0 rounded-t-3xl'
      }`}
      style={wide ? undefined : { height }}
      aria-label={boxName(box)}
    >
      <div className={`px-5 pb-3 border-b border-stone-100 ${wide ? 'pt-5' : 'pt-2'}`}>
        {!wide && <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-stone-200" />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold leading-tight truncate">
              {box.kind !== 'box' && <span className="mr-1.5">{KINDS[box.kind].icon}</span>}
              {boxName(box)}
              {suffix && <span className="font-semibold text-stone-500"> · {suffix}</span>}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {describePlacement(box)} · {typeText}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="flex-shrink-0 w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 font-semibold"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            placeholder={box.kind === 'loose' ? 'Legg til en ting …' : 'Legg noe i boksen …'}
            enterKeyHint="done"
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-stone-200 text-[16px] focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
          <button
            type="submit"
            disabled={!newItem.trim()}
            className="px-4 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 font-semibold text-stone-900"
          >
            Legg i
          </button>
        </form>

        <h3 className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Innhold ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-stone-400 text-sm">Ingenting registrert her ennå</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map(item => {
              const match = q !== '' && normalize(item.name).includes(q)
              return (
                <li key={item.id} className="flex items-center gap-3 py-1.5">
                  {editingId === item.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => finishRename(item)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-md border border-amber-400 text-[16px] focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startRename(item)}
                      title="Trykk for å endre navnet"
                      className={`flex-1 min-w-0 truncate text-left rounded-md px-1.5 py-1 -mx-1.5 ${match ? 'bg-amber-100 font-semibold' : 'hover:bg-stone-50'}`}
                    >
                      {item.name}
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveItem(item)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-red-50 hover:text-red-600 text-sm text-stone-600"
                  >
                    Ta ut
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onEdit} className="py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-sm font-semibold">
            ✏️ Endre
          </button>
          <button onClick={onMove} className="py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-sm font-semibold">
            ↔ Flytt
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-stone-400">Trykk på en ting for å endre navnet</p>
      </div>
    </section>
  )
}
