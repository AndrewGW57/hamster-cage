'use client'

import { useEffect, useRef, useState } from 'react'
import { PlayerFlag } from '@/components/PlayerFlag'
import { adminFetch } from '@/lib/admin-fetch'
import type {
  MergeCohortStanding,
  MergePlayerSnapshot,
  MergePreviewResponse,
  MergeResult,
  MergeTableCounts,
} from '@/types'

const TABLE_LABELS: Record<string, string> = {
  results: 'Results',
  bonus_points: 'Bonus points',
  side_contests: 'Side contests',
  player_aliases: 'Aliases',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PlayerColumn({
  label,
  player,
  counts,
  standings,
}: {
  label: string
  player: MergePlayerSnapshot
  counts: MergeTableCounts
  standings: { cohort_name: string; standing: MergeCohortStanding | null }[]
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-2 text-[#111111] font-semibold text-sm">
        <PlayerFlag code={player.country_code} />
        {player.display_name}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-gray-500">Code</dt>
        <dd className="font-mono uppercase text-gray-700">{player.country_code ?? '—'}</dd>
        <dt className="text-gray-500">LD yards</dt>
        <dd className="text-gray-700">{player.ld_handicap_yards}</dd>
        <dt className="text-gray-500">Created</dt>
        <dd className="text-gray-700">{formatDate(player.created_at)}</dd>
        <dt className="text-gray-500">Aliases</dt>
        <dd className="text-gray-700">{player.aliases.length ? player.aliases.join(', ') : '—'}</dd>
      </dl>

      <div className="mt-3 pt-2 border-t border-gray-200 space-y-0.5 text-xs">
        {Object.entries(TABLE_LABELS).map(([key, text]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-500">{text}</span>
            <span className="font-mono text-gray-700">{counts[key as keyof MergeTableCounts]}</span>
          </div>
        ))}
      </div>

      {standings.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-200 text-xs">
          <div className="text-gray-500 mb-1">Cohort totals today</div>
          {standings.map(({ cohort_name, standing }) => (
            <div key={cohort_name} className="flex justify-between py-0.5">
              <span className="text-gray-700">{cohort_name}</span>
              {standing ? (
                <span className="font-mono text-gray-700">
                  #{standing.rank} · {standing.rounds_played} rds · {standing.stableford_total}+{standing.bonus_total} ={' '}
                  <span className="font-semibold">{standing.total}</span>
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MergePlayersDialog({
  playerIds,
  onClose,
  onMerged,
}: {
  playerIds: [string, string]
  onClose: () => void
  onMerged: (result: MergeResult) => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MergePreviewResponse | null>(null)
  const [error, setError] = useState('')
  const [finalName, setFinalName] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && !merging) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, merging])

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      try {
        const res = await adminFetch('/api/merge-players/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_a: playerIds[0], player_b: playerIds[1] }),
        })
        if (cancelled) return
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'Preview failed')
        if (!cancelled) setData(body as MergePreviewResponse)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPreview()
    return () => {
      cancelled = true
    }
  }, [playerIds])

  const preview = data?.preview
  const blocked =
    !preview ||
    preview.collisions.length > 0 ||
    preview.alias_conflicts.length > 0 ||
    preview.name_conflicts.length > 0
  const needsAck = (preview?.warnings.length ?? 0) > 0
  const canConfirm = !blocked && !!finalName && (!needsAck || acknowledged) && !merging

  async function handleConfirm() {
    if (!preview || !finalName) return
    setMerging(true)
    setError('')
    try {
      const res = await adminFetch('/api/merge-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_a: preview.survivor.id,
          player_b: preview.removed.id,
          final_name: finalName,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Merge failed')
      onMerged(body.result as MergeResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  const standingsFor = (side: 'survivor' | 'removed') =>
    (data?.cohort_totals ?? []).map((c) => ({ cohort_name: c.cohort_name, standing: c[side] }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-0 sm:px-4"
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && !merging && onClose()}
    >
      <div className="bg-white border border-gray-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-amber-500">Merge players</h2>
            <p className="text-sm text-gray-500">Two records become one. The older record is kept.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={merging}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Checking both records…</p>}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PlayerColumn
                  label="Kept (older record)"
                  player={preview.survivor}
                  counts={preview.counts.survivor}
                  standings={standingsFor('survivor')}
                />
                <PlayerColumn
                  label="Removed"
                  player={preview.removed}
                  counts={preview.counts.removed}
                  standings={standingsFor('removed')}
                />
              </div>

              {/* Collisions and blockers */}
              {blocked && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 space-y-1">
                  <div className="font-semibold">These records cannot be merged:</div>
                  {preview.collisions.map((c) => (
                    <div key={`${c.table}-${c.week_id}`}>
                      Both have {TABLE_LABELS[c.table].toLowerCase()} in {c.cohort ?? 'no cohort'} week {c.week_number}{' '}
                      ({formatDate(c.date)}, {c.course})
                    </div>
                  ))}
                  {preview.alias_conflicts.map((a) => (
                    <div key={`alias-${a.owner_id}-${a.alias}`}>
                      Alias &ldquo;{a.alias}&rdquo; already belongs to {a.owner}
                    </div>
                  ))}
                  {preview.name_conflicts.map((n) => (
                    <div key={`name-${n.id}`}>
                      &ldquo;{n.display_name}&rdquo; is another player&rsquo;s display name
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings: survivor's value is kept */}
              {needsAck && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
                  {preview.warnings.map((w) => (
                    <div key={w.field}>
                      {w.field === 'country_code' ? 'Country code' : 'LD yards'} differs: kept{' '}
                      <span className="font-mono">{String(w.survivor)}</span>, removed{' '}
                      <span className="font-mono">{String(w.removed)}</span>. The kept record&rsquo;s value stays.
                    </div>
                  ))}
                  <label className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="accent-amber-500"
                    />
                    I understand the kept record&rsquo;s values are used
                  </label>
                </div>
              )}

              {/* Name to display: required, nothing preselected */}
              <fieldset className="space-y-1">
                <legend className="text-sm font-semibold text-gray-700 mb-1">Name to display</legend>
                {[preview.survivor.display_name, preview.removed.display_name].map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="merge-final-name"
                      value={name}
                      checked={finalName === name}
                      onChange={() => setFinalName(name)}
                      className="accent-amber-500"
                    />
                    {name}
                  </label>
                ))}
                <p className="text-xs text-gray-500">
                  The other name is kept as an alias, so future uploads under it still match.
                </p>
              </fieldset>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={merging}
            className="text-sm border border-gray-300 text-gray-500 hover:bg-gray-100 rounded px-3 py-1 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="text-sm bg-amber-400 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded px-3 py-1 transition-colors"
          >
            {merging ? 'Merging…' : 'Merge players'}
          </button>
        </div>
      </div>
    </div>
  )
}
