'use client'

import { useState, useEffect, useRef } from 'react'

export function RulesEditor({ initialNotes }: { initialNotes: string }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(initialNotes)
  const [draft, setDraft] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('adminSession')
      if (!raw) return
      const session = JSON.parse(raw)
      if (session?.authenticated) setIsAdmin(true)
    } catch {}
  }, [])

  // Deep link from the admin page ("Edit Rules") drops you straight into
  // edit mode instead of making you find the Edit button yourself.
  useEffect(() => {
    if (!isAdmin) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('editRules') === '1') {
      setDraft(notes)
      setEditing(true)
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/update-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'rules_notes', value: draft }),
    })
    if (res.ok) {
      setNotes(draft)
      setEditing(false)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
    }
    setSaving(false)
  }

  if (!notes && !isAdmin) return null

  return (
    <div ref={containerRef} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">
          Additional Notes
        </h2>
        {isAdmin && !editing && (
          <button
            onClick={() => { setDraft(notes); setEditing(true) }}
            className="text-xs text-amber-600 hover:text-amber-700"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-amber-400 resize-y"
            autoFocus
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-400 hover:bg-amber-500 text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{notes}</p>
      )}
    </div>
  )
}
