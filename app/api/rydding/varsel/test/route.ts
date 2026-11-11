import { NextResponse } from 'next/server'
import { sendPush } from '@/lib/varsel'

export const dynamic = 'force-dynamic'

/** Sender et testvarsel til én telefon, den som ba om det. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const endpoint = (body as { endpoint?: unknown }).endpoint
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ ok: false, error: 'Mangler endpoint' }, { status: 400 })
  }
  try {
    const result = await sendPush(
      { title: '🧹 Testvarsel', body: 'Varsler virker på denne telefonen. Morgenvarselet kommer på ryddedagen.', url: '/rydding', tag: 'rydding-test' },
      endpoint,
    )
    return NextResponse.json({ ok: result.sent > 0, ...result })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ ok: false, error: String((error as Error).message ?? error) }, { status: 500 })
  }
}
