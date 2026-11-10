'use client'

import { useEffect } from 'react'

/** Ark som glir opp nederst på mobil og vises som en boks midt på større skjermer. */
export default function Sheet({ title, subtitle, onClose, children, footer, stacked = false }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode // ligger fast nederst, utenfor det som ruller
  stacked?: boolean // ligger over et annet ark
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 ${stacked ? 'z-50 bg-black/30' : 'z-40 bg-black/40'} flex items-end sm:items-center justify-center`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-slate-900 shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className={`overflow-y-auto px-5 pt-3 ${footer ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+1.25rem)]'}`}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-snug">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Lukk" className="h-9 w-9 flex-shrink-0 rounded-full bg-slate-100 font-semibold text-slate-600">
              ✕
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{footer}</div>
        )}
      </div>
    </div>
  )
}
