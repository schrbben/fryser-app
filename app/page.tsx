'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateSlug } from '@/lib/utils'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [joinSlug, setJoinSlug] = useState('')

  const createNewRoom = async () => {
    setLoading(true)
    try {
      const slug = generateSlug()
      const { data, error } = await supabase
        .from('rooms')
        .insert([{ slug }])
        .select()
        .single()

      if (error) throw error
      router.push(`/fryser/${slug}`)
    } catch (error) {
      console.error('Feil ved opprettelse av rom:', error)
      alert('Kunne ikke opprette fryser. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = () => {
    if (joinSlug.trim()) {
      router.push(`/fryser/${joinSlug.trim().toLowerCase()}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🧊</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">FryserApp</h1>
            <p className="text-gray-600">Del fryserinnhold med kompisene dine</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={createNewRoom}
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Oppretter...' : '➕ Opprett ny fryser'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">eller</span>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Skriv inn fryser-kode"
                value={joinSlug}
                onChange={(e) => setJoinSlug(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={joinRoom}
                disabled={!joinSlug.trim()}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                🔗 Åpne fryser
              </button>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700">
            <p className="mb-2"><strong>💡 Slik fungerer det:</strong></p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Opprett en ny fryser og få en unik kode</li>
              <li>Del koden med kompisene dine</li>
              <li>Alle kan legge til og se innhold</li>
              <li>Ingen innlogging nødvendig</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
