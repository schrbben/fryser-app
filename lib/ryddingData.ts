import { supabase } from './supabase'
import { DEFAULT_SETTINGS, type Chore, type ChoreCompletion, type ChoreRoom, type ChoreSettings } from './rydding'

export type RyddingData = { rooms: ChoreRoom[]; chores: Chore[]; completions: ChoreCompletion[]; settings: ChoreSettings }

/** Henter alle rader, 1000 om gangen (Supabase gir maks 1000 per spørring). */
async function fetchAll<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

export async function fetchRyddingData(): Promise<RyddingData> {
  const [rooms, chores, completions, settings] = await Promise.all([
    fetchAll<ChoreRoom>('chore_rooms', 'sort_order'),
    fetchAll<Chore>('chores', 'created_at'),
    fetchAll<ChoreCompletion>('chore_completions', 'done_on', false),
    supabase.from('chore_settings').select('*').eq('id', 1).maybeSingle(),
  ])
  if (settings.error) throw settings.error
  return { rooms, chores, completions, settings: { ...DEFAULT_SETTINGS, ...(settings.data ?? {}) } }
}
