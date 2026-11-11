'use client'

import { useEffect, useState } from 'react'
import {
  currentSubscription, disablePush, enablePush, pushSupport, saveSubscription, sendTestPush, subscriptionCount,
  type PushSupport,
} from '@/lib/push'

type Status = 'checking' | 'off' | 'on' | 'denied' | 'busy'

/** Slå varsler av og på for denne telefonen. */
export default function PushSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [status, setStatus] = useState<Status>('checking')
  const [note, setNote] = useState<string | null>(null)
  const [devices, setDevices] = useState<number | null>(null)

  const refreshCount = () => subscriptionCount().then(setDevices).catch(() => setDevices(null))

  useEffect(() => {
    const s = pushSupport()
    setSupport(s)
    refreshCount()
    if (s !== 'ok') return setStatus('off')
    if (Notification.permission === 'denied') return setStatus('denied')
    currentSubscription()
      .then(async sub => {
        if (sub && Notification.permission === 'granted') {
          await saveSubscription(sub).catch(() => {}) // i tilfelle raden er borte fra databasen
          setStatus('on')
        } else {
          setStatus('off')
        }
      })
      .catch(() => setStatus('off'))
  }, [])

  const turnOn = async () => {
    setStatus('busy')
    setNote(null)
    try {
      await enablePush()
      setStatus('on')
      setNote('Varsler er slått på. Trykk «Send testvarsel» for å sjekke.')
    } catch (error) {
      const message = (error as Error).message
      if (message === 'denied') {
        setStatus('denied')
      } else {
        setStatus('off')
        setNote(message === 'dismissed' ? 'Du må trykke «Tillat» for å få varsler.' : 'Fikk ikke slått på varsler. Prøv igjen.')
      }
    }
    refreshCount()
  }

  const turnOff = async () => {
    setStatus('busy')
    await disablePush().catch(() => {})
    setStatus('off')
    setNote('Varsler er slått av på denne telefonen.')
    refreshCount()
  }

  const test = async () => {
    const sub = await currentSubscription()
    if (!sub) return setStatus('off')
    setNote('Sender …')
    const result = await sendTestPush(sub).catch(() => ({ ok: false }))
    setNote(result.ok ? 'Testvarselet er sendt. Det kan ta noen sekunder.' : 'Testvarselet kom ikke fram. Prøv å slå varsler av og på igjen.')
  }

  return (
    <div className="space-y-2">
      {support === 'install' && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          På iPhone må appen ligge på Hjem-skjermen for å få varsler. Åpne siden i Safari, trykk Del-knappen → «Legg til på Hjem-skjerm», og åpne appen derfra.
        </p>
      )}
      {support === 'unsupported' && <p className="text-sm text-slate-500">Denne nettleseren støtter ikke varsler.</p>}

      {support === 'ok' && status === 'denied' && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Varsler er blokkert for appen. Slå dem på i iPhone-innstillingene under Varslinger, og åpne appen på nytt.
        </p>
      )}

      {support === 'ok' && (status === 'off' || status === 'checking') && (
        <button onClick={turnOn} disabled={status === 'checking'} className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          🔔 Slå på varsler på denne telefonen
        </button>
      )}
      {status === 'busy' && <p className="text-sm text-slate-500">Et øyeblikk …</p>}

      {support === 'ok' && status === 'on' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-emerald-700">✓ På for denne telefonen</span>
          <button onClick={test} className="rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700">
            Send testvarsel
          </button>
          <button onClick={turnOff} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500">
            Slå av
          </button>
        </div>
      )}

      {note && <p className="text-sm text-slate-600">{note}</p>}
      {devices != null && (
        <p className="text-xs text-slate-500">
          {devices === 0 ? 'Ingen telefoner får varsel ennå.' : `${devices} ${devices === 1 ? 'telefon får' : 'telefoner får'} varsel.`}
        </p>
      )}
    </div>
  )
}
