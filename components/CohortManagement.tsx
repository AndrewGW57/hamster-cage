'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CohortRow {
  id: string
  name: string
  status: 'active' | 'closed'
  scores_to_count: number
  min_rounds_to_rank: number
  total_weeks: number      // from DB: planned duration
  uploaded_weeks: number   // computed: actual weeks in the weeks table
  weeks_per_tab: number
}

interface FormState {
  name: string
  scores_to_count: number
  min_rounds_to_rank: number
  total_weeks: number
  weeks_per_tab: number
  status: 'active' | 'closed'
}

const EMPTY_FORM: FormState = { name: '', scores_to_count: 3, min_rounds_to_rank: 1, total_weeks: 0, weeks_per_tab: 5, status: 'active' }

function StatusBadge({ status }: { status: 'active' | 'closed' }) {
  return status === 'active' ? (
    <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">Active</span>
  ) : (
    <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">Closed</span>
  )
}

function NumInput({
  value,
  onChange,
  min = 1,
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  className?: string
}) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value, 10) || min))}
      className={`w-16 border border-gray-300 rounded px-2 py-0.5 text-xs font-mono text-center focus:outline-none focus:border-amber-400 bg-white ${className}`}
    />
  )
}

function FormFields({
  state,
  onChange,
}: {
  state: FormState
  onChange: (patch: Partial<FormState>) => void
}) {
  return (
    <>
      <td className="py-2 px-2">
        <input
          type="text"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Cohort name"
          autoFocus
          className="w-full min-w-[140px] border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-amber-400 bg-white"
        />
      </td>
      <td className="py-2 px-2">
        <select
          value={state.status}
          onChange={(e) => onChange({ status: e.target.value as 'active' | 'closed' })}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-amber-400 bg-white"
        >
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </td>
      <td className="py-2 px-2 text-center">
        <NumInput value={state.total_weeks} min={0} onChange={(v) => onChange({ total_weeks: v })} />
      </td>
      <td className="py-2 px-2 text-center">
        <NumInput value={state.scores_to_count} onChange={(v) => onChange({ scores_to_count: v })} />
      </td>
      <td className="py-2 px-2 text-center">
        <NumInput value={state.min_rounds_to_rank} onChange={(v) => onChange({ min_rounds_to_rank: v })} />
      </td>
      <td className="py-2 px-2 text-center">
        <NumInput value={state.weeks_per_tab} min={1} onChange={(v) => onChange({ weeks_per_tab: Math.min(10, v) })} />
      </td>
    </>
  )
}

function ViewRow({
  cohort,
  onEdit,
  onToggle,
  toggling,
  showSaved,
}: {
  cohort: CohortRow
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
  showSaved: boolean
}) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-3 text-sm font-medium text-gray-900">{cohort.name}</td>
      <td className="py-2 px-3"><StatusBadge status={cohort.status} /></td>
      <td className="py-2 px-3 text-center text-sm text-gray-600 font-mono">
        {cohort.uploaded_weeks > 0 ? cohort.uploaded_weeks : cohort.total_weeks || <span className="text-gray-300">—</span>}
      </td>
      <td className="py-2 px-3 text-center text-sm text-gray-600 font-mono">{cohort.scores_to_count}</td>
      <td className="py-2 px-3 text-center text-sm text-gray-600 font-mono">{cohort.min_rounds_to_rank}</td>
      <td className="py-2 px-3 text-center text-sm text-gray-600 font-mono">{cohort.weeks_per_tab}</td>
      <td className="py-2 px-3 text-right space-x-2 whitespace-nowrap">
        {showSaved && <span className="text-green-600 text-xs mr-1 font-medium">Saved</span>}
        <button
          type="button"
          onClick={onEdit}
          className="text-xs border border-amber-300 text-amber-600 hover:bg-amber-50 rounded px-2 py-0.5 transition-colors"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={toggling}
          className="text-xs border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-50 rounded px-2 py-0.5 transition-colors"
        >
          {toggling ? '…' : cohort.status === 'active' ? 'Close' : 'Reopen'}
        </button>
      </td>
    </tr>
  )
}

function EditRow({
  editState,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  editState: FormState
  onChange: (patch: Partial<FormState>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <tr className="border-b border-gray-100 bg-amber-50">
      <FormFields state={editState} onChange={onChange} />
      <td className="py-2 px-3 text-right space-x-2 whitespace-nowrap">
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

function NewRow({
  state,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  state: FormState
  onChange: (patch: Partial<FormState>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <tr className="border-b border-gray-100 bg-green-50">
      <FormFields state={state} onChange={onChange} />
      <td className="py-2 px-3 text-right space-x-2 whitespace-nowrap">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !state.name.trim()}
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

export function CohortManagement() {
  const [expanded, setExpanded] = useState(false)
  const [cohorts, setCohorts] = useState<CohortRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<FormState>(EMPTY_FORM)
  const [showNew, setShowNew] = useState(false)
  const [newState, setNewState] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function fetchCohorts() {
    setLoading(true)
    const [{ data: cohortsData }, { data: weeksData }] = await Promise.all([
      supabase
        .from('cohorts')
        .select('id, name, status, scores_to_count, min_rounds_to_rank, total_weeks, weeks_per_tab')
        .order('created_at'),
      supabase.from('weeks').select('id, cohort_id'),
    ])
    const weekCounts = new Map<string, number>()
    for (const w of weeksData ?? []) {
      if (w.cohort_id) weekCounts.set(w.cohort_id, (weekCounts.get(w.cohort_id) ?? 0) + 1)
    }
    setCohorts(
      (cohortsData ?? []).map((c) => ({
        ...c,
        min_rounds_to_rank: c.min_rounds_to_rank ?? 1,
        total_weeks: c.total_weeks ?? 0,
        weeks_per_tab: c.weeks_per_tab ?? 5,
        uploaded_weeks: weekCounts.get(c.id) ?? 0,
      }))
    )
    setLoading(false)
  }

  function handleToggleSection() {
    const next = !expanded
    setExpanded(next)
    if (next && cohorts.length === 0) fetchCohorts()
  }

  function startEdit(cohort: CohortRow) {
    setEditingId(cohort.id)
    setEditState({
      name: cohort.name,
      scores_to_count: cohort.scores_to_count,
      min_rounds_to_rank: cohort.min_rounds_to_rank,
      total_weeks: cohort.total_weeks,
      weeks_per_tab: cohort.weeks_per_tab,
      status: cohort.status,
    })
    setShowNew(false)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setError('')
  }

  async function saveEdit(cohort: CohortRow) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/update-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cohort.id, ...editState }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg ?? 'Save failed')
      }
      setCohorts((prev) =>
        prev.map((c) =>
          c.id === cohort.id ? { ...c, ...editState } : c
        )
      )
      setEditingId(null)
      setSavedId(cohort.id)
      setTimeout(() => setSavedId(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(cohort: CohortRow) {
    setTogglingId(cohort.id)
    setError('')
    const newStatus = cohort.status === 'active' ? 'closed' : 'active'
    try {
      const res = await fetch('/api/update-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cohort.id, status: newStatus }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg ?? 'Toggle failed')
      }
      setCohorts((prev) =>
        prev.map((c) => (c.id === cohort.id ? { ...c, status: newStatus } : c))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setTogglingId(null)
    }
  }

  async function saveNew() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/create-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      })
      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg ?? 'Create failed')
      }
      const { cohort } = await res.json()
      setCohorts((prev) => [
        ...prev,
        { ...cohort, min_rounds_to_rank: cohort.min_rounds_to_rank ?? 1, total_weeks: cohort.total_weeks ?? 0, weeks_per_tab: cohort.weeks_per_tab ?? 5, uploaded_weeks: 0 },
      ])
      setShowNew(false)
      setNewState(EMPTY_FORM)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={handleToggleSection}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">Manage Cohorts</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {error && <p className="px-4 pt-3 text-sm text-red-500">{error}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100 text-left">
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3 w-20">Status</th>
                      <th className="py-2 px-3 w-20 text-center">Total Wks</th>
                      <th className="py-2 px-3 w-20 text-center">Scores</th>
                      <th className="py-2 px-3 w-24 text-center">Min Rnds</th>
                      <th className="py-2 px-3 w-20 text-center">Wks/Tab</th>
                      <th className="py-2 px-3 w-36" />
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((cohort) =>
                      editingId === cohort.id ? (
                        <EditRow
                          key={cohort.id}
                          editState={editState}
                          onChange={(patch) => setEditState((s) => ({ ...s, ...patch }))}
                          onSave={() => saveEdit(cohort)}
                          onCancel={cancelEdit}
                          saving={saving}
                        />
                      ) : (
                        <ViewRow
                          key={cohort.id}
                          cohort={cohort}
                          onEdit={() => startEdit(cohort)}
                          onToggle={() => toggleStatus(cohort)}
                          toggling={togglingId === cohort.id}
                          showSaved={savedId === cohort.id}
                        />
                      )
                    )}
                    {showNew && (
                      <NewRow
                        state={newState}
                        onChange={(patch) => setNewState((s) => ({ ...s, ...patch }))}
                        onSave={saveNew}
                        onCancel={() => { setShowNew(false); setNewState(EMPTY_FORM) }}
                        saving={saving}
                      />
                    )}
                  </tbody>
                </table>
              </div>
              {!showNew && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setShowNew(true); setEditingId(null); setNewState(EMPTY_FORM) }}
                    className="text-xs border border-amber-300 text-amber-600 hover:bg-amber-50 rounded px-3 py-1 transition-colors"
                  >
                    + New Cohort
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
