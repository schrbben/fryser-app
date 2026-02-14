'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect direkte til fryseren
    router.push('/fryser')
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🧊</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">FryserApp</h1>
            <p className="text-gray-600">Omdirigerer til fryser...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
