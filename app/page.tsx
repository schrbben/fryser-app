'use client'

import { useState, useEffect } from 'react'
import { supabase, type Item, type Room, type HistoryEntry } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import AppSwitcher from '@/components/AppSwitcher'

type SortMode = 'newest' | 'oldest'
type View = 'main' | 'history'

const SHARED_SLUG = 'felles'
const STALE_DAYS = 90 // 3 måneder

function daysSince(dateString: string): number {
  const diffMs = Date.now() - new Date(dateString).getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function freshnessColor(days: number): string {
  if (days <= 45) {
    const hue = 140 - (days / 45) * 90
    return `hsl(${hue}, 65%, 45%)`
  }
  const extra = Math.min(days - 45, 45)
  const hue = 50 - (extra / 45) * 50
  return `hsl(${hue}, 65%, 45%)`
}

function FreshnessDot({ days }: { days: number }) {
  const color = freshnessColor(days)
  const isStale = days >= STALE_DAYS
  return (
    <div className="flex items-center gap-1.5" title={`${days} dager i fryseren`}>
      <span
        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-gray-500">
        {days} {days === 1 ? 'dag' : 'dager'}{isStale ? ' – gammel!' : ''}
      </span>
    </div>
  )
}

export default function FreezerPage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<View>('main')
  const [sortMode, setSortMode] = useState<SortMode>('oldest')
  const [searchQuery, setSearchQuery] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    quantity: 1,
    unit: 'stk',
    note: ''
  })

  useEffect(() => {
    loadRoom()
  }, [])

  // Oppdater automatisk 0,5 sek etter at fryseren er lastet inn
  useEffect(() => {
    if (!room) return
    const timer = setTimeout(() => {
      loadItems()
      loadHistory()
    }, 500)
    return () => clearTimeout(timer)
  }, [room])

  // Oppdater automatisk hver gang appen kommer tilbake i fokus
  // (f.eks. når du bytter tilbake fra en annen app på mobilen)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && room) {
        loadItems()
        loadHistory()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [room])

  useEffect(() => {
    if (!room) return

    const itemsChannel = supabase
      .channel('items-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `room_id=eq.${room.id}` },
        () => loadItems()
      )
      .subscribe()

    const historyChannel = supabase
      .channel('history-changes')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'history', filter: `room_id=eq.${room.id}` },
        () => loadHistory()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(itemsChannel)
      supabase.removeChannel(historyChannel)
    }
  }, [room])

  const loadRoom = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('slug', SHARED_SLUG)
        .single()

      if (error) {
        alert('Kunne ikke laste fryser. Sjekk at du har kjørt SQL-scriptet i Supabase.')
        setLoading(false)
        return
      }

      setRoom(data)
      await loadItems()
      await loadHistory()
    } catch (error) {
      console.error(error)
      alert('Kunne ikke koble til database.')
    } finally {
      setLoading(false)
    }
  }

  const loadItems = async () => {
    if (!room) return
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'active')
      .order('added_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }
    setItems(data || [])
  }

  const loadHistory = async () => {
    if (!room) return
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .eq('room_id', room.id)
      .order('timestamp', { ascending: false })
      .limit(100)

    if (error) {
      console.error(error)
      return
    }
    setHistory(data || [])
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadItems()
    await loadHistory()
    setRefreshing(false)
  }

  const addToHistory = async (item: Item, action: string, quantityBefore?: number, quantityAfter?: number) => {
    if (!room) return
    await supabase.from('history').insert([{
      room_id: room.id,
      item_id: item.id,
      item_name: item.name,
      action,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter
    }])
  }

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room) return
    try {
      const { data, error } = await supabase
        .from('items')
        .insert([{ room_id: room.id, ...formData }])
        .select()
        .single()

      if (error) throw error
      await addToHistory(data, 'added')

      setFormData({ name: '', quantity: 1, unit: 'stk', note: '' })
      setShowAddModal(false)
      await loadItems()
    } catch (error) {
      console.error(error)
      alert('Kunne ikke legge til vare')
    }
  }

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem || !room) return
    try {
      const { error } = await supabase
        .from('items')
        .update(formData)
        .eq('id', editingItem.id)

      if (error) throw error
      await addToHistory(editingItem, 'edited')

      setEditingItem(null)
      setFormData({ name: '', quantity: 1, unit: 'stk', note: '' })
      await loadItems()
    } catch (error) {
      console.error(error)
      alert('Kunne ikke oppdatere vare')
    }
  }

  const handleQuantityChange = async (item: Item, delta: number) => {
    const newQuantity = Math.max(0, item.quantity + delta)

    if (newQuantity === 0) {
      const confirmArchive = window.confirm(`${item.name} er tom. Vil du arkivere den?`)
      if (confirmArchive) {
        await archiveItem(item)
        return
      }
    }

    try {
      const { error } = await supabase
        .from('items')
        .update({ quantity: newQuantity })
        .eq('id', item.id)

      if (error) throw error
      await addToHistory(item, 'quantity_changed', item.quantity, newQuantity)
    } catch (error) {
      console.error(error)
    }
  }

  const archiveItem = async (item: Item) => {
    try {
      const { error } = await supabase
        .from('items')
        .update({ status: 'archived' })
        .eq('id', item.id)

      if (error) throw error
      await addToHistory(item, 'archived')
    } catch (error) {
      console.error(error)
      alert('Kunne ikke arkivere vare')
    }
  }

  const deleteItem = async (item: Item) => {
    const confirmDelete = window.confirm(`Er du sikker på at du vil slette ${item.name}?`)
    if (!confirmDelete) return

    try {
      await addToHistory(item, 'deleted')
      const { error } = await supabase.from('items').delete().eq('id', item.id)
      if (error) throw error
    } catch (error) {
      console.error(error)
      alert('Kunne ikke slette vare')
    }
  }

  const openEditModal = (item: Item) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note || ''
    })
  }

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.note && item.note.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortMode === 'newest') {
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    }
    return new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
  })

  const staleItems = items.filter(i => daysSince(i.added_at) >= STALE_DAYS)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🧊</div>
          <p className="text-slate-500">Laster fryser...</p>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Fryser ikke funnet</h1>
          <p className="text-slate-500 text-sm">Sjekk at SQL-scriptet er kjørt i Supabase.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="sr-only">Fryseren</h1>
            <AppSwitcher active="fryser" />
            <div className="flex gap-3 text-lg">
              <button onClick={handleRefresh} disabled={refreshing} title="Oppdater">
                {refreshing ? '⏳' : '🔄'}
              </button>
              <button onClick={() => setShowShareModal(true)} title="Del lenke">
                🔗
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setView('main')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                view === 'main' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Innhold
            </button>
            <button
              onClick={() => setView('history')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                view === 'history' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Historikk
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {view === 'main' && staleItems.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-medium text-sm">
              🔴 {staleItems.length} vare{staleItems.length !== 1 ? 'r' : ''} har ligget over 3 måneder:
            </p>
            <p className="text-red-600 text-sm mt-1">
              {staleItems.map(i => i.name).join(', ')}
            </p>
          </div>
        )}

        {view === 'main' && (
          <>
            <div className="mb-4 space-y-2">
              <input
                type="text"
                placeholder="Søk etter vare..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setSortMode('oldest')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    sortMode === 'oldest' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  Eldste først
                </button>
                <button
                  onClick={() => setSortMode('newest')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    sortMode === 'newest' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  Nyeste først
                </button>
              </div>
            </div>

            {sortedItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">❄️</div>
                <p>Fryseren er tom</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-100">
                {sortedItems.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onEdit={openEditModal}
                    onQuantityChange={handleQuantityChange}
                    onArchive={archiveItem}
                    onDelete={deleteItem}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {view === 'history' && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-center py-16 text-slate-400">Ingen historikk ennå</p>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="bg-white rounded-lg border border-slate-100 p-3">
                  <div className="flex justify-between items-start">
                    <p className="text-sm text-slate-700">
                      {entry.action === 'added' && '➕ Lagt til'}
                      {entry.action === 'edited' && '✏️ Redigert'}
                      {entry.action === 'quantity_changed' && '🔢 Mengde endret'}
                      {entry.action === 'archived' && '📦 Arkivert'}
                      {entry.action === 'deleted' && '🗑️ Slettet'}
                      : <strong>{entry.item_name}</strong>
                      {entry.quantity_before != null && entry.quantity_after != null && (
                        <span className="text-slate-400"> ({entry.quantity_before} → {entry.quantity_after})</span>
                      )}
                    </p>
                    <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{formatDate(entry.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {view === 'main' && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-105"
        >
          +
        </button>
      )}

      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-800">
                {editingItem ? 'Rediger vare' : 'Legg til vare'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingItem(null)
                  setFormData({ name: '', quantity: 1, unit: 'stk', note: '' })
                }}
                className="text-slate-400 text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={editingItem ? handleUpdateItem : handleAddItem} className="space-y-4">
              <input
                type="text"
                required
                placeholder="Navn på vare"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                >
                  <option value="stk">stk</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="poser">poser</option>
                  <option value="pakker">pakker</option>
                  <option value="bokser">bokser</option>
                </select>
              </div>

              <textarea
                placeholder="Notat (valgfritt)"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 resize-none"
                rows={2}
              />

              <button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition-colors"
              >
                {editingItem ? 'Lagre endringer' : 'Legg til'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-800">Del fryseren</h2>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 text-xl">✕</button>
            </div>
            <p className="text-sm text-slate-500 mb-3">Del denne lenken med kompisene dine:</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== 'undefined' ? window.location.origin + '/fryser' : ''}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + '/fryser')
                  alert('Lenke kopiert!')
                }}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm"
              >
                Kopier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  onEdit,
  onQuantityChange,
  onArchive,
  onDelete
}: {
  item: Item
  onEdit: (item: Item) => void
  onQuantityChange: (item: Item, delta: number) => void
  onArchive: (item: Item) => void
  onDelete: (item: Item) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const days = daysSince(item.added_at)

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-800 truncate">{item.name}</h3>
            {item.note && <span title={item.note} className="text-sm">💬</span>}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{item.quantity} {item.unit}</p>
          <div className="mt-1.5">
            <FreshnessDot days={days} />
          </div>
          {item.note && <p className="text-sm text-slate-400 mt-1.5 italic">{item.note}</p>}
        </div>
        <button
          onClick={() => setShowActions(!showActions)}
          className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-500"
        >
          ⋮
        </button>
      </div>

      {showActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => onQuantityChange(item, -1)} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium">− Trekk fra</button>
          <button onClick={() => onQuantityChange(item, 1)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-sm font-medium">+ Legg til</button>
          <button onClick={() => { onEdit(item); setShowActions(false) }} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium">Rediger</button>
          <button onClick={() => { onArchive(item); setShowActions(false) }} className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg text-sm font-medium">Arkiver</button>
          <button onClick={() => { onDelete(item); setShowActions(false) }} className="col-span-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Slett</button>
        </div>
      )}
    </div>
  )
}
