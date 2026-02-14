import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

export type Item = {
  id: string
  room_id: string
  name: string
  quantity: number
  unit: string
  owner: 'person1' | 'person2' | 'person3'
  note?: string
  added_at: string
  updated_at: string
  status: 'active' | 'archived'
}

export type Room = {
  id: string
  slug: string
  person1_name: string
  person2_name: string
  person3_name: string
  created_at: string
}

export type HistoryEntry = {
  id: string
  room_id: string
  item_id?: string
  item_name: string
  action: string
  owner?: string
  quantity_before?: number
  quantity_after?: number
  timestamp: string
}
