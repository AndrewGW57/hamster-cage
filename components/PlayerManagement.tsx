'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Player {
  id: string
  display_name: string
  country_code: string | null
  ld_handicap_yards: number
}

function FlagPreview({ code }: { code: string }) {
  if (!code || code.length < 2) return <span className="inline-block w-4 h-3 bg-gray-200 rounded-sm" />
  return (
    <img
      src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
      width={16}
      height={12}
      alt={code}
      className="inline-block w-4 h-3"
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
    />
  )
}

function ViewRow({
  player,
  onEdit,
  showSaved,
}: {
  player: Player
  onEdit: () => void
  showSaved: boolean
}) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-3">
        <FlagPreview code={player.country_code ?? ''} />
      </td>
      <td className="py-2 px-3 text-gray-900 font-medium text-sm">{player.display_name}</td>
      <td className="py-2 px-3 text-gray-500 font-mono text-xs uppercase">
        {player.country_code ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="py-2 px-3">
        {player.ld_handicap_yards > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            −{player.ld_handicap_yards} yds
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        {showSaved && <span className="text-green-600 text-xs mr-3 font-medium">Saved</span>}
        <button
          type="button"
          onClick={onEdit}
          className="text-xs border border-amber-300 text-amber-600 hover:bg-amber-50 rounded px-2 py-0.5 transition-colors"
        >
          Edit
        </button>
      </td>
    </tr>
  )
}

function EditRow({
  player,
  editCode,
  setEditCode,
  editLdYards,
  setEditLdYards,
  onSave,
  onCancel,
  saving,
}: {
  player: Player
  editCode: string
  setEditCode: (v: string) => void
  editLdYards: number
  setEditLdYards: (v: number) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <tr className="border-b border-gray-100 bg-amber-50">
      <td className="py-2 px-3">
        <FlagPreview code={editCode} />
      </td>
      <td className="py-2 px-3 text-gray-900 font-medium text-sm">{player.display_name}</td>
      <td className="py-2 px-3">
        <input
          type="text"
          value={editCode}
          onChange={(e) => setEditCode(e.target.value.toUpperCase().slice(0, 2))}
          maxLength={2}
          placeholder="XX"
          autoFocus
          className="w-12 border border-gray-300 rounded px-2 py-0.5 text-xs font-mono uppercase focus:outline-none focus:border-amber-400 bg-white"
        />
      </td>
      <td className="py-2 px-3">
        <input
          type="number"
          min={0}
          value={editLdYards}
          onChange={(e) => setEditLdYards(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 border border-gray-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-amber-400 bg-white"
        />
      </td>
      <td className="py-2 px-3 text-right space-x-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="text-xs bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black font-semibold rounded px-2 py-0.5 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs border border-gray-300 text-gray-500 hover:bg-gray-100 rounded px-2 py-0.5 transition-colors"
        >
          Cancel
        </button>
      </td>
    </tr>
  )
}

export function PlayerManagement() {
  const [expanded, setExpanded] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editLdYards, setEditLdYards] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function fetchPlayers() {
    setLoading(true)
    const { data } = await supabase
      .from('players')
      .select('id, display_name, country_code, ld_handicap_yards')
      .order('display_name')
    setPlayers(data ?? [])
    setLoading(false)
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && players.length === 0) fetchPlayers()
  }

  function startEdit(player: Player) {
    setEditingId(player.id)
    setEditCode(player.country_code?.toUpperCase() ?? '')
    setEditLdYards(player.ld_handicap_yards)
    setSavedId(null)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditCode('')
    setEditLdYards(0)
    setError('')
  }

  async function saveEdit(player: Player) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/update-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: player.id,
          country_code: editCode.toLowerCase() || null,
          ld_handicap_yards: editLdYards,
        }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg ?? 'Save failed')
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? { ...p, country_code: editCode.toLowerCase() || null, ld_handicap_yards: editLdYards }
            : p
        )
      )
      setEditingId(null)
      setSavedId(player.id)
      setTimeout(() => setSavedId(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">Manage Players</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {error && <p className="px-4 pt-3 text-sm text-red-500">{error}</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100 text-left">
                    <th className="py-2 px-3 w-8" />
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3 w-16">Code</th>
                    <th className="py-2 px-3 w-28">LD Handicap (yds)</th>
                    <th className="py-2 px-3 w-36" />
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) =>
                    editingId === player.id ? (
                      <EditRow
                        key={player.id}
                        player={player}
                        editCode={editCode}
                        setEditCode={setEditCode}
                        editLdYards={editLdYards}
                        setEditLdYards={setEditLdYards}
                        onSave={() => saveEdit(player)}
                        onCancel={cancelEdit}
                        saving={saving}
                      />
                    ) : (
                      <ViewRow
                        key={player.id}
                        player={player}
                        onEdit={() => startEdit(player)}
                        showSaved={savedId === player.id}
                      />
                    )
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
