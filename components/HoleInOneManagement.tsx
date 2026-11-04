'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'

// Hole-in-ones are entered by hand: Trackman leaderboard exports don't record them.

interface WeekOption {
  id: string
  week_number: number
  course_name: string
  date: string
  cohort_name: string | null
}

interface WeekPlayer {
  player_id: string
  display_name: string
}

interface Ace {
  id: string
  week_id: string
  player_id: string
  hole: number | null
  display_name: string
}

export function HoleInOneManagement() {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [aces, setAces] = useState<Ace[]>([])
  const [weekId, setWeekId] = useState('')
  const [weekPlayers, setWeekPlayers] = useState<WeekPlayer[]>([])
  const [playerId, setPlayerId] = useState('')
  const [hole, setHole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: weeksRaw }, { data: acesRaw }] = await Promise.all([
      supabase
        .from('weeks')
        .select('id, week_number, course_name, date, is_bye, cohorts(name)')
        .order('date', { ascending: false }),
      supabase
        .from('hole_in_ones')
        .select('id, week_id, player_id, hole, players(display_name)')
        .order('created_at', { ascending: false }),
    ])
    setWeeks(
      (weeksRaw ?? [])
        .filter((w) => !w.is_bye)
        .map((w) => ({
          id: w.id,
          week_number: w.week_number,
          course_name: w.course_name,
          date: w.date,
          cohort_name: (w.cohorts as unknown as { name: string } | null)?.name ?? null,
        }))
    )
    setAces(
      (acesRaw ?? []).map((a) => ({
        id: a.id,
        week_id: a.week_id,
        player_id: a.player_id,
        hole: a.hole,
        display_name: (a.players as unknown as { display_name: string } | null)?.display_name ?? '',
      }))
    )
    setLoading(false)
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && weeks.length === 0) load()
  }

  async function selectWeek(id: string) {
    setWeekId(id)
    setPlayerId('')
    setWeekPlayers([])
    setError('')
    if (!id) return
    const { data } = await supabase
      .from('results')
      .select('player_id, players(display_name)')
      .eq('week_id', id)
    setWeekPlayers(
      (data ?? [])
        .map((r) => ({
          player_id: r.player_id,
          display_name: (r.players as unknown as { display_name: string } | null)?.display_name ?? '',
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
    )
  }

  function weekLabel(w: WeekOption | undefined) {
    if (!w) return 'Unknown week'
    return `${w.cohort_name ? `${w.cohort_name} · ` : ''}Wk ${w.week_number} · ${w.course_name} · ${w.date}`
  }

  async function addAce() {
    if (!weekId || !playerId) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await adminFetch('/api/hole-in-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId, player_id: playerId, hole: hole || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Save failed')
      const name = weekPlayers.find((p) => p.player_id === playerId)?.display_name ?? ''
      setNotice(`♠️ Hole-in-one added for ${name}`)
      setPlayerId('')
      setHole('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeAce(ace: Ace) {
    setError('')
    setNotice('')
    try {
      const res = await adminFetch('/api/hole-in-one', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ace.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Remove failed')
      setAces((prev) => prev.filter((a) => a.id !== ace.id))
      setNotice(`Removed hole-in-one for ${ace.display_name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  return (
    <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">♠️ Hole-in-Ones</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Trackman exports don&apos;t record aces, so add them here. A badge on the leaderboard only — no points.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_6rem_auto] gap-2 items-end">
                <label className="text-xs text-gray-500 space-y-1">
                  <span className="block">Week</span>
                  <select
                    value={weekId}
                    onChange={(e) => selectWeek(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
                  >
                    <option value="">Select week…</option>
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>{weekLabel(w)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500 space-y-1">
                  <span className="block">Player</span>
                  <select
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    disabled={!weekId}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white disabled:bg-gray-50"
                  >
                    <option value="">{weekId && weekPlayers.length === 0 ? 'No results this week' : 'Select player…'}</option>
                    {weekPlayers.map((p) => (
                      <option key={p.player_id} value={p.player_id}>{p.display_name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500 space-y-1">
                  <span className="block">Hole (optional)</span>
                  <input
                    type="number"
                    min={1}
                    max={18}
                    value={hole}
                    onChange={(e) => setHole(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={addAce}
                  disabled={!weekId || !playerId || saving}
                  className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black text-sm font-semibold rounded-lg px-4 py-1.5 transition-colors"
                >
                  {saving ? 'Adding…' : 'Add'}
                </button>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              {notice && <p className="text-sm text-green-600">{notice}</p>}

              {aces.length === 0 ? (
                <p className="text-sm text-gray-400">No hole-in-ones recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100 text-left">
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 px-3">Week</th>
                      <th className="py-2 px-3 w-14">Hole</th>
                      <th className="py-2 pl-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {aces.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-medium text-gray-900">♠️ {a.display_name}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{weekLabel(weeks.find((w) => w.id === a.week_id))}</td>
                        <td className="py-2 px-3 font-mono text-gray-700">{a.hole ?? '—'}</td>
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeAce(a)}
                            className="text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded px-2 py-0.5 transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
