import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { buildPlan, shoppingList, todayString, weekdayOf } from '@/lib/rydding'
import { fetchRyddingData } from '@/lib/ryddingData'
import { morningMessage, sendPush } from '@/lib/varsel'

export const dynamic = 'force-dynamic'

/** Klokkeslettet i Norge, «HH:MM». */
const osloTime = (now: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)

/**
 * Morgenvarselet. Databasen kaller denne hvert kvarter (pg_cron i Supabase). Den sender bare når
 * det er ryddedag, klokka har passert varseltidspunktet og dagens varsel ikke er sendt.
 * Den kan derfor kalles så ofte man vil. ?dryRun viser hva som ville blitt sendt.
 */
export async function GET(request: Request) {
  const dryRun = new URL(request.url).searchParams.has('dryRun')
  const now = new Date()
  const today = todayString(now)
  const time = osloTime(now)

  try {
    const data = await fetchRyddingData()
    const settings = data.settings
    const notifyAt = settings.notify_time.slice(0, 5)
    const plan = buildPlan(data.chores, data.completions, settings, today)
    const message = morningMessage(plan, shoppingList(plan, today))

    const reason =
      weekdayOf(today) !== settings.cleaning_weekday ? 'ikke ryddedag'
        : time < notifyAt ? `før ${notifyAt}`
          : settings.notify_sent_on === today ? 'allerede sendt i dag'
            : !message ? 'ingenting å gjøre'
              : null
    if (dryRun || reason) {
      return NextResponse.json({ sent: 0, reason: reason ?? 'prøvekjøring', today, time, notifyAt, message })
    }

    // Merk dagen som sendt før vi sender, så to kall samtidig ikke gir to varsler
    const { data: claimed, error } = await supabase
      .from('chore_settings')
      .update({ notify_sent_on: today })
      .eq('id', 1)
      .or(`notify_sent_on.is.null,notify_sent_on.neq.${today}`)
      .select('id')
    if (error) throw error
    if (!claimed?.length) return NextResponse.json({ sent: 0, reason: 'allerede sendt i dag', today, time })

    // Kom ingenting fram, frigis dagen igjen, så neste kall (om et kvarter) prøver på nytt
    const release = () => supabase.from('chore_settings').update({ notify_sent_on: settings.notify_sent_on }).eq('id', 1)
    try {
      const result = await sendPush(message!)
      if (result.sent === 0 && result.failed > 0) await release()
      return NextResponse.json({ ...result, today, time, message })
    } catch (error) {
      await release()
      throw error
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ ok: false, error: String((error as Error).message ?? error) }, { status: 500 })
  }
}
