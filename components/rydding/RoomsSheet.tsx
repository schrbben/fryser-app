'use client'

import { useState } from 'react'
import type { ChoreRoom } from '@/lib/rydding'
import Sheet from './Sheet'

function RoomRow({ room, count, first, last, taken, onRename, onMove, onDelete }: {
  room: ChoreRoom
  count: number
  first: boolean
  last: boolean
  taken: (name: string) => boolean
  onRename: (name: string) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(room.name)
  const trimmed = name.trim()
  const changed = trimmed !== room.name
  const problem = !trimmed ? 'Rommet må ha et navn.' : changed && taken(trimmed) ? 'Det finnes allerede et rom med det navnet.' : null

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && changed && !problem && onRename(trimmed)}
          aria-label={`Navn på ${room.name}`}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-base text-slate-900 focus:border-violet-400"
        />
        {changed ? (
          <>
            <button onClick={() => !problem && onRename(trimmed)} disabled={!!problem} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Lagre
            </button>
            <button onClick={() => setName(room.name)} className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-500">
              Avbryt
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onMove(-1)} disabled={first} aria-label={`Flytt ${room.name} opp`} className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30">
              ↑
            </button>
            <button onClick={() => onMove(1)} disabled={last} aria-label={`Flytt ${room.name} ned`} className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-30">
              ↓
            </button>
          </>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-xs">
        <span className={problem ? 'text-red-600' : 'text-slate-500'}>
          {problem ?? `${count} ${count === 1 ? 'oppgave' : 'oppgaver'}`}
        </span>
        {count === 0 && !changed && (
          <button onClick={onDelete} className="font-semibold text-red-600">
            Slett rommet
          </button>
        )}
      </div>
    </li>
  )
}

/** Legg til, gi nytt navn, sorter og slett tomme rom. */
export default function RoomsSheet({ rooms, counts, onAdd, onRename, onMove, onDelete, onClose }: {
  rooms: ChoreRoom[]
  counts: Map<string, number>
  onAdd: (name: string) => void
  onRename: (room: ChoreRoom, name: string) => void
  onMove: (room: ChoreRoom, direction: -1 | 1) => void
  onDelete: (room: ChoreRoom) => void
  onClose: () => void
}) {
  const [newName, setNewName] = useState('')
  const taken = (name: string) => rooms.some(r => r.name.toLocaleLowerCase('nb') === name.toLocaleLowerCase('nb'))
  const trimmed = newName.trim()
  const addProblem = trimmed && taken(trimmed) ? 'Det finnes allerede et rom med det navnet.' : null
  const add = () => {
    if (!trimmed || addProblem) return
    onAdd(trimmed)
    setNewName('')
  }

  return (
    <Sheet title="Rom" subtitle="Rekkefølgen her brukes i filteret og når du velger rom." onClose={onClose}>
      <ul className="divide-y divide-slate-100">
        {rooms.map((room, i) => (
          <RoomRow
            key={`${room.id}-${room.name}`}
            room={room}
            count={counts.get(room.id) ?? 0}
            first={i === 0}
            last={i === rooms.length - 1}
            taken={name => rooms.some(r => r.id !== room.id && r.name.toLocaleLowerCase('nb') === name.toLocaleLowerCase('nb'))}
            onRename={name => onRename(room, name)}
            onMove={direction => onMove(room, direction)}
            onDelete={() => onDelete(room)}
          />
        ))}
      </ul>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <label className="block text-sm font-semibold text-slate-700" htmlFor="new-room">Nytt rom</label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="new-room"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="F.eks. Bod eller Balkong"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-base text-slate-900"
          />
          <button onClick={add} disabled={!trimmed || !!addProblem} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Legg til
          </button>
        </div>
        {addProblem && <p className="mt-1 text-xs text-red-600">{addProblem}</p>}
      </div>
    </Sheet>
  )
}
