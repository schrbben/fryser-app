'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/push'

/** Registrerer service workeren som viser varsler. Viser ingenting selv. */
export default function ServiceWorker() {
  useEffect(() => {
    registerServiceWorker().catch(error => console.warn('Service worker ble ikke registrert', error))
  }, [])
  return null
}
