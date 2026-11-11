// Varsler på denne telefonen (kjører i nettleseren).
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushSupport = 'ok' | 'install' | 'unsupported'

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** «install» betyr at appen må legges på Hjem-skjermen først (iPhone). */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !VAPID_PUBLIC_KEY) return 'unsupported'
  if (isIOS() && !isStandalone()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() ? 'install' : 'unsupported'
  }
  return 'ok'
}

function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Ukjent'
}

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js')
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Lagrer abonnementet i databasen (trygt å gjøre flere ganger). */
export async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, keys: json.keys, device: deviceName() }, { onConflict: 'endpoint' })
  if (error) throw error
}

/**
 * Slår på varsler. Må kalles direkte fra et trykk, ellers lar ikke iPhone appen spørre om lov.
 * Kaster 'denied' eller 'dismissed' hvis brukeren ikke gir lov.
 */
export async function enablePush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed')
  await registerServiceWorker()
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  await saveSubscription(sub)
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('/api/rydding/varsel/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  return response.json()
}

export async function subscriptionCount(): Promise<number> {
  const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true })
  return count ?? 0
}
