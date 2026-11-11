// Sending av varsler. Brukes bare på serveren (API-rutene), fordi den trenger den private nøkkelen.
import webpush from 'web-push'
import { supabase } from './supabase'
import type { ChoreState, Plan } from './rydding'

export type PushPayload = { title: string; body: string; url?: string; tag?: string }

type Subscription = { id: string; endpoint: string; keys: { p256dh: string; auth: string } }

function configure() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('Mangler VAPID-nøklene for varsler')
  webpush.setVapidDetails('https://fryser-app.vercel.app', publicKey, privateKey)
}

/** Teksten i morgenvarselet, f.eks. «6 oppgaver, ca. 85 min». Null når det ikke er noe å gjøre. */
export function morningMessage(plan: Plan, shopping: ChoreState[]): PushPayload | null {
  const count = plan.planned.length
  if (count === 0) return null
  const names = plan.planned.slice(0, 3).map(s => s.chore.name.charAt(0).toLowerCase() + s.chore.name.slice(1))
  const more = count > 3 ? ` og ${count - 3} til` : ''
  const lines = [`${count} ${count === 1 ? 'oppgave' : 'oppgaver'}, ca. ${plan.plannedMinutes} min: ${names.join(', ')}${more}.`]
  if (shopping.length) lines.push(`🛒 ${shopping.map(s => s.chore.purchase_item).join(', ')}`)
  return { title: '🧹 Ryddedag i dag', body: lines.join('\n'), url: '/rydding', tag: `rydding-${plan.day}` }
}

/**
 * Sender til alle telefoner med varsler på, eller bare til én (`endpoint`).
 * Abonnement som ikke finnes lenger (404/410), slettes.
 */
export async function sendPush(payload: PushPayload, endpoint?: string) {
  configure()
  let query = supabase.from('push_subscriptions').select('id, endpoint, keys')
  if (endpoint) query = query.eq('endpoint', endpoint)
  const { data, error } = await query
  if (error) throw error
  const subs = (data ?? []) as Subscription[]

  let sent = 0
  let removed = 0
  let failed = 0
  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' })
        sent++
        await supabase.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).eq('id', sub.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          removed++
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          failed++
          console.error('Varsel feilet', status, (e as { body?: string }).body ?? e)
        }
      }
    })
  )
  return { total: subs.length, sent, removed, failed }
}
