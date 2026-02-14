'use client'

import { useState, useEffect } from 'react'
import { supabase, type Item, type Room, type HistoryEntry } from '@/lib/supabase'
import { formatDate, getOwnerName } from '@/lib/utils'

type SortMode = 'owner' | 'newest' | 'oldest'
type View = 'main' | 'history'

const SHARED_SLUG = 'felles' // Fast slug for delt fryser

export default function FreezerPage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('main')
  const [sortMode, setSortMode] = useState<SortMode>('owner')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    quantity: 1,
    unit: 'stk',
    owner: 'person1' as 'person1' | 'person2' | 'person3',
    note: ''
  })

  const [settingsData, setSettingsData] = useState({
    person1_name: 'Person 1',
    person2_name: 'Person 2',
    person3_name: 'Person 3'
  })

  useEffect(() => {
    loadRoom()
  }, [])

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
        console.error('Feil ved lasting av rom:', error)
        alert('Kunne ikke laste fryser. Sjekk at du har kjørt SQL-scriptet i Supabase.')
        setLoading(false)
        return
      }

      setRoom(data)
      setSettingsData({
        person1_name: data.person1_name,
        person2_name: data.person2_name,
        person3_name: data.person3_name
      })
      await loadItems()
      await loadHistory()
    } catch (error) {
      console.error('Feil ved lasting av rom:', error)
      alert('Kunne ikke koble til database. Sjekk Supabase-innstillinger.')
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
      console.error('Feil ved lasting av varer:', error)
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
      console.error('Feil ved lasting av historikk:', error)
      return
    }

    setHistory(data || [])
  }

  const addToHistory = async (item: Item, action: string, quantityBefore?: number, quantityAfter?: number) => {
    if (!room) return

    await supabase.from('history').insert([{
      room_id: room.id,
      item_id: item.id,
      item_name: item.name,
      action,
      owner: item.owner,
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
        .insert([{
          room_id: room.id,
          ...formData
        }])
        .select()
        .single()

      if (error) throw error

      await addToHistory(data, 'added')
      
      setFormData({
        name: '',
        quantity: 1,
        unit: 'stk',
        owner: 'person1',
        note: ''
      })
      setShowAddModal(false)
    } catch (error) {
      console.error('Feil ved legging til vare:', error)
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
      setFormData({
        name: '',
        quantity: 1,
        unit: 'stk',
        owner: 'person1',
        note: ''
      })
    } catch (error) {
      console.error('Feil ved oppdatering:', error)
      alert('Kunne ikke oppdatere vare')
    }
  }

  const handleQuantityChange = async (item: Item, delta: number) => {
    const newQuantity = Math.max(0, item.quantity + delta)
    
    if (newQuantity === 0) {
      const confirm = window.confirm(`${item.name} er tom. Vil du arkivere den?`)
      if (confirm) {
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
      console.error('Feil ved endring av mengde:', error)
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
      console.error('Feil ved arkivering:', error)
      alert('Kunne ikke arkivere vare')
    }
  }

  const deleteItem = async (item: Item) => {
    const confirm = window.confirm(`Er du sikker på at du vil slette ${item.name}?`)
    if (!confirm) return

    try {
      await addToHistory(item, 'deleted')
      
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', item.id)

      if (error) throw error
    } catch (error) {
      console.error('Feil ved sletting:', error)
      alert('Kunne ikke slette vare')
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room) return

    try {
      const { error } = await supabase
        .from('rooms')
        .update(settingsData)
        .eq('id', room.id)

      if (error) throw error

      setRoom({ ...room, ...settingsData })
      setShowSettingsModal(false)
      alert('Innstillinger lagret!')
    } catch (error) {
      console.error('Feil ved lagring av innstillinger:', error)
      alert('Kunne ikke lagre innstillinger')
    }
  }

  const openEditModal = (item: Item) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      owner: item.owner,
      note: item.note || ''
    })
  }

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.note && item.note.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortMode === 'owner') {
      if (a.owner === b.owner) {
        return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
      }
      return a.owner.localeCompare(b.owner)
    } else if (sortMode === 'newest') {
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    } else {
      return new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    }
  })

  const groupedByOwner = sortMode === 'owner'
    ? {
        person1: sortedItems.filter(i => i.owner === 'person1'),
        person2: sortedItems.filter(i => i.owner === 'person2'),
        person3: sortedItems.filter(i => i.owner === 'person3')
      }
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🧊</div>
          <p className="text-gray-600">Laster fryser...</p>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Fryser ikke funnet</h1>
            <p className="text-gray-600 mb-6">
              Fryseren må opprettes i Supabase først.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-left text-sm">
              <p className="font-semibold mb-2">Kjør dette SQL-scriptet i Supabase:</p>
              <code className="block bg-white p-3 rounded border text-xs overflow-x-auto">
                INSERT INTO rooms (slug, person1_name, person2_name, person3_name)<br/>
                VALUES ('felles', 'Person 1', 'Person 2', 'Person 3')<br/>
                ON CONFLICT (slug) DO NOTHING;
              </code>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🧊 Vår Fryser</h1>
              <p className="text-sm text-gray-500">Felles for alle</p>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="text-2xl hover:scale-110 transition-transform"
            >
              ⚙️
            </button>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setView('main')}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                view === 'main'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📦 Innhold
            </button>
            <button
              onClick={() => setView('history')}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                view === 'history'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📜 Historikk
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {view === 'main' && (
          <>
            <div className="mb-4 space-y-3">
              <input
                type="text"
                placeholder="🔍 Søk etter vare..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
              
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSortMode('owner')}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-colors ${
                    sortMode === 'owner'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300'
                  }`}
                >
                  👤 Sorter på eier
                </button>
                <button
                  onClick={() => setSortMode('newest')}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-colors ${
                    sortMode === 'newest'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300'
                  }`}
                >
                  🆕 Nyeste først
                </button>
                <button
                  onClick={() => setSortMode('oldest')}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-colors ${
                    sortMode === 'oldest'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300'
                  }`}
                >
                  🕐 Eldste først
                </button>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">❄️</div>
                <p className="text-lg mb-2">Fryseren er tom</p>
                <p className="text-sm">Trykk på + for å legge til noe</p>
              </div>
            ) : groupedByOwner ? (
              <div className="space-y-6">
                {(['person1', 'person2', 'person3'] as const).map(owner => {
                  const ownerItems = groupedByOwner[owner]
                  if (ownerItems.length === 0) return null

                  return (
                    <div key={owner} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-3">
                        <h3 className="font-bold text-lg">
                          {getOwnerName(owner, room)}
                        </h3>
                        <p className="text-sm opacity-90">
                          {ownerItems.length} vare{ownerItems.length !== 1 ? 'r' : ''}
                        </p>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {ownerItems.map(item => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            room={room}
                            onEdit={openEditModal}
                            onQuantityChange={handleQuantityChange}
                            onArchive={archiveItem}
                            onDelete={deleteItem}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {sortedItems.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    room={room}
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
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Ingen historikk ennå</p>
              </div>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">
                        {entry.action === 'added' && '➕ Lagt til'}
                        {entry.action === 'edited' && '✏️ Redigert'}
                        {entry.action === 'quantity_changed' && '🔢 Mengde endret'}
                        {entry.action === 'archived' && '📦 Arkivert'}
                        {entry.action === 'deleted' && '🗑️ Slettet'}
                        : <strong>{entry.item_name}</strong>
                      </p>
                      {entry.owner && (
                        <p className="text-sm text-gray-600">
                          Eier: {getOwnerName(entry.owner as any, room)}
                        </p>
                      )}
                      {entry.quantity_before !== null && entry.quantity_after !== null && (
                        <p className="text-sm text-gray-600">
                          {entry.quantity_before} → {entry.quantity_after}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(entry.timestamp)}
                    </span>
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
          className="fixed bottom-6 right-6 w-16 h-16 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-3xl transition-transform hover:scale-110 active:scale-95"
        >
          +
        </button>
      )}

      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  {editingItem ? '✏️ Rediger vare' : '➕ Legg til vare'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingItem(null)
                    setFormData({
                      name: '',
                      quantity: 1,
                      unit: 'stk',
                      owner: 'person1',
                      note: ''
                    })
                  }}
                  className="text-2xl text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={editingItem ? handleUpdateItem : handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Navn
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="F.eks. Pizza"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mengde
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enhet
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="stk">stk</option>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="poser">poser</option>
                      <option value="pakker">pakker</option>
                      <option value="bokser">bokser</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Eier
                  </label>
                  <select
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value as any })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="person1">{room.person1_name}</option>
                    <option value="person2">{room.person2_name}</option>
                    <option value="person3">{room.person3_name}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notat (valgfritt)
                  </label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                    rows={3}
                    placeholder="F.eks. utgår 15. mars"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-lg transition-colors"
                >
                  {editingItem ? 'Lagre endringer' : 'Legg til'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">⚙️ Innstillinger</h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-2xl text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Person 1 navn
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsData.person1_name}
                    onChange={(e) => setSettingsData({ ...settingsData, person1_name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Person 2 navn
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsData.person2_name}
                    onChange={(e) => setSettingsData({ ...settingsData, person2_name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Person 3 navn
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsData.person3_name}
                    onChange={(e) => setSettingsData({ ...settingsData, person3_name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-lg transition-colors"
                >
                  Lagre innstillinger
                </button>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Del denne lenken:</strong>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? window.location.origin + '/fryser' : ''}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + '/fryser')
                        alert('Lenke kopiert!')
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  room,
  onEdit,
  onQuantityChange,
  onArchive,
  onDelete
}: {
  item: Item
  room: Room
  onEdit: (item: Item) => void
  onQuantityChange: (item: Item, delta: number) => void
  onArchive: (item: Item) => void
  onDelete: (item: Item) => void
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-800 truncate">{item.name}</h3>
            {item.note && (
              <span title={item.note} className="text-lg cursor-help">
                💬
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {item.quantity} {item.unit} • {getOwnerName(item.owner, room)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(item.added_at)}
          </p>
          {item.note && (
            <p className="text-sm text-gray-500 mt-2 italic">{item.note}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowActions(!showActions)}
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            ⋮
          </button>
        </div>
      </div>

      {showActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onQuantityChange(item, -1)}
            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
          >
            − Trekk fra
          </button>
          <button
            onClick={() => onQuantityChange(item, 1)}
            className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-sm font-medium transition-colors"
          >
            + Legg til
          </button>
          <button
            onClick={() => {
              onEdit(item)
              setShowActions(false)
            }}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition-colors"
          >
            ✏️ Rediger
          </button>
          <button
            onClick={() => {
              onArchive(item)
              setShowActions(false)
            }}
            className="px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-600 rounded-lg text-sm font-medium transition-colors"
          >
            📦 Arkiver
          </button>
          <button
            onClick={() => {
              onDelete(item)
              setShowActions(false)
            }}
            className="col-span-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            🗑️ Slett
          </button>
        </div>
      )}
    </div>
  )
}
