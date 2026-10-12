'use client'

import { useState } from 'react'
import { COLORS, KINDS, KIND_ORDER, type ContainerKind } from '@/lib/storage'

export type ContainerDraft = {
  kind: ContainerKind
  number: number | null
  label: string
  color: string
  location: string
}

const LABEL_PLACEHOLDERS: Record<ContainerKind, string> = {
  box: 'f.eks. Julepynt',
  suitcase: 'f.eks. Samsonite koffert',
  cardboard: 'f.eks. Pappboks fra mormor',
  bin: 'f.eks. Plastboks lilla',
  loose: 'f.eks. Løse ting ved døra',
}

export default function ContainerDialog({ title, initial, hereText, onShelf, canPlaceInBod, startElsewhere, takenNumbers, submitLabel, onSave, onDelete, onCancel }: {
  title: string
  initial: ContainerDraft
  hereText: string
  onShelf: boolean
  canPlaceInBod: (kind: ContainerKind) => boolean
  startElsewhere: boolean
  takenNumbers: Set<number>
  submitLabel: string
  onSave: (draft: ContainerDraft, elsewhere: boolean) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [numberText, setNumberText] = useState(initial.number != null ? String(initial.number) : '')
  const [elsewhere, setElsewhere] = useState(startElsewhere)

  const number = numberText.trim() === '' ? null : Number(numberText)
  const numberError =
    draft.kind !== 'box' || number == null
      ? null
      : !Number.isInteger(number) || number < 1
        ? 'Nummeret må være et helt tall'
        : takenNumbers.has(number)
          ? `Nummer ${number} er allerede i bruk`
          : null
  const blocked = (kind: ContainerKind) => !elsewhere && !canPlaceInBod(kind)
  const canSave = !numberError && !blocked(draft.kind)

  const setKind = (kind: ContainerKind) =>
    setDraft(d => ({ ...d, kind, color: KINDS[kind].colors.includes(d.color) ? d.color : KINDS[kind].colors[0] }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    onSave(
      {
        ...draft,
        number: draft.kind === 'box' ? number : null,
        label: draft.label.trim(),
        location: elsewhere ? draft.location.trim() : '',
      },
      elsewhere
    )
  }

  const colors = KINDS[draft.kind].colors

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Lukk" className="w-9 h-9 rounded-full bg-stone-100 font-semibold text-stone-600">
            ✕
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-stone-500">Hva er det?</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {KIND_ORDER.map(kind => (
              <button
                key={kind}
                type="button"
                disabled={blocked(kind)}
                onClick={() => setKind(kind)}
                className={`flex flex-col items-center rounded-xl border px-2 py-2 text-xs font-semibold disabled:opacity-35 ${
                  draft.kind === kind ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-white'
                }`}
              >
                <span className="text-xl leading-none">{KINDS[kind].icon}</span>
                <span className="mt-1">{KINDS[kind].name}</span>
              </button>
            ))}
          </div>
          {onShelf && !elsewhere && (
            <p className="mt-1.5 text-xs text-stone-400">
              {blocked('suitcase')
                ? 'En koffert tar to plasser i hylla, og det er ikke to ledige plasser ved siden av hverandre her.'
                : 'En koffert tar to plasser i hylla.'}
            </p>
          )}
        </fieldset>

        {draft.kind === 'box' && (
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-stone-500">Nummer på lappen</span>
            <input
              type="text"
              inputMode="numeric"
              value={numberText}
              onChange={e => setNumberText(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Uten nummer"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 text-[16px] focus:outline-none focus:border-amber-500"
            />
            {numberError && <span className="mt-1 block text-xs text-red-600">{numberError}</span>}
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-stone-500">Navn {draft.kind === 'box' ? '(valgfritt)' : ''}</span>
          <input
            type="text"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder={LABEL_PLACEHOLDERS[draft.kind]}
            maxLength={50}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 text-[16px] focus:outline-none focus:border-amber-500"
          />
        </label>

        {colors.length > 1 && (
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold text-stone-500">Farge</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {colors.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, color }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${
                    draft.color === color ? 'border-amber-500 bg-amber-50 font-semibold' : 'border-stone-200 bg-white'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border ${COLORS[color]?.swatch ?? ''}`} />
                  {COLORS[color]?.label ?? color}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-stone-500">Hvor står den?</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setElsewhere(false)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${!elsewhere ? 'border-amber-500 bg-amber-50 font-semibold' : 'border-stone-200'}`}
            >
              I boden
              <span className="block text-xs font-normal text-stone-500">{hereText}</span>
            </button>
            <button
              type="button"
              onClick={() => setElsewhere(true)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${elsewhere ? 'border-amber-500 bg-amber-50 font-semibold' : 'border-stone-200'}`}
            >
              Et annet sted
              <span className="block text-xs font-normal text-stone-500">Vises i søk og på kartet</span>
            </button>
          </div>
          {elsewhere && (
            <input
              type="text"
              value={draft.location}
              onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
              placeholder="f.eks. Lille soverom"
              maxLength={50}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-stone-200 text-[16px] focus:outline-none focus:border-amber-500"
            />
          )}
        </fieldset>

        <div className="mt-6 flex gap-2">
          {onDelete && (
            <button type="button" onClick={onDelete} className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-semibold">
              Fjern
            </button>
          )}
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-stone-100 font-semibold text-stone-700">
            Avbryt
          </button>
          <button type="submit" disabled={!canSave} className="flex-1 py-2.5 rounded-xl bg-amber-400 font-bold text-stone-900 disabled:opacity-40">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
