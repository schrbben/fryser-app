import type { Status } from '@/lib/rydding'

export const STATUS_STYLE: Record<Status, { bar: string; dot: string; text: string; soft: string; label: string }> = {
  green: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50 border-emerald-200', label: 'Forfaller senere' },
  yellow: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700', soft: 'bg-amber-50 border-amber-200', label: 'Forfaller innen ryddedagen' },
  orange: { bar: 'bg-orange-500', dot: 'bg-orange-500', text: 'text-orange-700', soft: 'bg-orange-50 border-orange-200', label: 'Over frist' },
  red: { bar: 'bg-red-600', dot: 'bg-red-600', text: 'text-red-700', soft: 'bg-red-50 border-red-200', label: 'Lenge over frist' },
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const mins = (minutes: number) => `${minutes} min`
