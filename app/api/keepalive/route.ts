import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Kalles én gang i døgnet av Vercel Cron (se vercel.json), slik at gratisprosjektet
// i Supabase ikke settes på pause etter 7 dager uten aktivitet.
export async function GET() {
  const { error } = await supabase.from('rooms').select('id').limit(1)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() })
}
