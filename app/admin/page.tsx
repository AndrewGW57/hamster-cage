'use client'

import { useState, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import { UploadZone } from '@/components/UploadZone'
import { PlayerManagement } from '@/components/PlayerManagement'
import { CohortManagement } from '@/components/CohortManagement'
import { AdminManagement } from '@/components/AdminManagement'
import { supabase } from '@/lib/supabase'
import type { ParsedWeekData, MatchedLeaderboardEntry } from '@/types'

type AdminStep = 'auth' | 'upload' | 'review' | 'done'

interface WeekOption {
  id: string
  week_number: number
  course_name: string
  date: string
  cohort_id: string | null
}

export default function AdminPage() {
  const [step, setStep] = useState<AdminStep>('auth')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  // Week selection
  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [selectedWeekId, setSelectedWeekId] = useState<string>('new')
  const [newCourseName, setNewCourseName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [selectedCohortId, setSelectedCohortId] = useState('')

  // Cohorts (for new week assignment)
  const [cohorts, setCohorts] = useState<{ id: string; name: string; status: string }[]>([])

  // Files
  const [lbFile, setLbFile] = useState<File | null>(null)
  const [ctpFile, setCtpFile] = useState<File | null>(null)
  const [ldFile, setLdFile] = useState<File | null>(null)

  // Parsed review state
  const [parsedData, setParsedData] = useState<ParsedWeekData | null>(null)
  const [reviewWeekId, setReviewWeekId] = useState<string>('')
  const [uploadIds, setUploadIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [ineligiblePlayers, setIneligiblePlayers] = useState<Set<string>>(new Set())
  const [saveWeekLoading, setSaveWeekLoading] = useState(false)
  const [saveWeekSuccess, setSaveWeekSuccess] = useState(false)

  async function loadWeeksAndCohorts() {
    const [{ data: weeksData }, { data: cohortsData }] = await Promise.all([
      supabase.from('weeks').select('id, week_number, course_name, date, cohort_id').order('date'),
      supabase.from('cohorts').select('id, name, status').order('created_at'),
    ])
    setWeeks(weeksData ?? [])
    const fetchedCohorts = cohortsData ?? []
    setCohorts(fetchedCohorts)
    const active = fetchedCohorts.find((c) => c.status === 'active')
    setSelectedCohortId(active?.id ?? fetchedCohorts[0]?.id ?? '')
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('adminSession')
      if (!raw) return
      const session = JSON.parse(raw)
      if (session?.authenticated && session?.username) {
        setUsername(session.username)
        loadWeeksAndCohorts().then(() => setStep('upload'))
      }
    } catch {}
  }, [])

  function handleLogout() {
    sessionStorage.removeItem('adminSession')
    setStep('auth')
    setUsername('')
    setPassword('')
  }

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const res = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      setAuthError('Invalid username or password')
      return
    }
    const data = await res.json()
    sessionStorage.setItem('adminSession', JSON.stringify({ username: data.username, authenticated: true }))
    setUsername(data.username)
    await loadWeeksAndCohorts()
    setStep('upload')
  }

  async function handleSaveWeek() {
    if (!newCourseName || !newDate) return
    setSaveWeekLoading(true)
    setSaveWeekSuccess(false)
    setParseError('')
    try {
      const res = await fetch('/api/create-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_name: newCourseName, date: newDate, cohort_id: selectedCohortId || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to create week')
      }
      const { week } = await res.json()
      await loadWeeksAndCohorts()
      setSelectedWeekId(week.id)
      setNewCourseName('')
      setNewDate('')
      setSaveWeekSuccess(true)
      setTimeout(() => setSaveWeekSuccess(false), 4000)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaveWeekLoading(false)
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setParseError('')
    if (!lbFile || !ctpFile || !ldFile) {
      setParseError('Please select all three screenshots.')
      return
    }

    setSubmitting(true)
    try {
      if (selectedWeekId === 'new' && (!newCourseName || !newDate)) {
        setParseError('Please enter course name and date for new week.')
        setSubmitting(false)
        return
      }

      // Week creation and storage uploads are handled server-side with service role
      const formData = new FormData()
      if (selectedWeekId !== 'new') {
        formData.append('week_id', selectedWeekId)
      } else {
        formData.append('course_name', newCourseName)
        formData.append('date', newDate)
        if (selectedCohortId) formData.append('cohort_id', selectedCohortId)
      }
      formData.append('leaderboard', lbFile)
      formData.append('ctp', ctpFile)
      formData.append('ld', ldFile)

      const parseRes = await fetch('/api/parse-week', {
        method: 'POST',
        body: formData,
      })
      if (!parseRes.ok) {
        const err = await parseRes.json()
        throw new Error(err.error ?? 'Parse failed')
      }

      const parsed = await parseRes.json()
      setParsedData({ leaderboard: parsed.leaderboard, ctp: parsed.ctp, ld: parsed.ld })
      setReviewWeekId(parsed.week_id)
      setUploadIds(parsed.upload_ids ?? [])
      setStep('review')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm() {
    if (!parsedData) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/confirm-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_id: reviewWeekId,
          leaderboard: parsedData.leaderboard,
          ctp: parsedData.ctp,
          ld: parsedData.ld,
          upload_ids: uploadIds,
          ineligible_players: Array.from(ineligiblePlayers),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Confirm failed')
      }
      setStep('done')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Derived ---
  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId)
  const filteredWeeks = weeks
    .filter((w) => w.cohort_id === selectedCohortId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w, i) => ({ ...w, localWeekNumber: i + 1 }))
  const editingClosedCohort = selectedWeekId !== 'new' && selectedCohort?.status === 'closed'

  // --- Render ---

  if (step === 'auth') {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
          <h1 className="text-xl font-bold text-amber-500 mb-6">Admin Access</h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400"
              autoFocus
              autoComplete="username"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400"
              autoComplete="current-password"
            />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-amber-400 hover:bg-amber-500 text-black font-semibold py-2.5 rounded-lg transition-colors"
            >
              Enter
            </button>
            <div className="text-center">
              <a href="/" className="text-sm text-amber-500 hover:text-amber-600">
                ← Back to Leaderboard
              </a>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-[#f9f9f9] text-gray-900 p-4">
        <div className="max-w-2xl mx-auto py-8">
          <a href="/" className="inline-flex items-center gap-1 text-sm text-amber-500 hover:text-amber-600 mb-6">
            ← Back to Leaderboard
          </a>
          <div className="flex items-baseline justify-between mb-2">
            <h1 className="text-2xl font-bold text-amber-500">Upload Week Results</h1>
            {username && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Logged in as {username}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Log Out"
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
          <p className="text-gray-500 mb-8">Upload the three Trackman screenshots to parse scores automatically.</p>

          <form onSubmit={handleUpload} className="space-y-8">
            {/* Cohort selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cohort</label>
              <select
                value={selectedCohortId}
                onChange={(e) => { setSelectedCohortId(e.target.value); setSelectedWeekId('new') }}
                className="bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:border-amber-400 w-full"
              >
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status === 'active' ? 'Active' : 'Closed'})
                  </option>
                ))}
              </select>
            </div>

            {/* Week selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
              <select
                value={selectedWeekId}
                onChange={(e) => setSelectedWeekId(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:border-amber-400 w-full"
              >
                <option value="new">+ New Week</option>
                {filteredWeeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    Week {w.localWeekNumber} — {w.course_name} ({w.date})
                  </option>
                ))}
              </select>
              {editingClosedCohort && (
                <p className="mt-2 text-xs font-medium text-amber-600">
                  Editing closed cohort: {selectedCohort?.name}
                </p>
              )}
              {selectedWeekId === 'new' && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Course name"
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      className="bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400"
                    />
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    This week will be added to{' '}
                    <span className="font-medium">{selectedCohort?.name}</span>.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveWeek}
                      disabled={saveWeekLoading || !newCourseName || !newDate}
                      className="px-4 py-2 text-sm bg-white border border-gray-300 hover:border-amber-400 text-gray-700 hover:text-amber-600 font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saveWeekLoading ? 'Saving…' : 'Save Week'}
                    </button>
                    {saveWeekSuccess && (
                      <p className="text-sm text-green-600 font-medium">Week saved! Select it from the dropdown above to upload results.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Upload zones */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UploadZone label="Leaderboard" file={lbFile} onChange={setLbFile} />
              <UploadZone label="Closest to Pin" file={ctpFile} onChange={setCtpFile} />
              <UploadZone label="Longest Drive" file={ldFile} onChange={setLdFile} />
            </div>

            {parseError && <p className="text-red-500 text-sm">{parseError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? 'Uploading & Parsing…' : 'Upload & Parse'}
            </button>
          </form>

          <PlayerManagement />
          <CohortManagement />
          <AdminManagement />
        </div>
      </div>
    )
  }

  if (step === 'review' && parsedData) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] text-gray-900 p-4">
        <div className="max-w-3xl mx-auto py-8">
          <h1 className="text-2xl font-bold text-amber-500 mb-2">Review Parsed Results</h1>
          <p className="text-gray-500 mb-8">Check the data below, then confirm to write to the database.</p>

          {/* Leaderboard */}
          <Section title="Leaderboard">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="pb-2 text-left">#</th>
                  <th className="pb-2 text-left">Name (parsed)</th>
                  <th className="pb-2 text-left">Matched to</th>
                  <th className="pb-2 text-right font-mono">Score</th>
                  <th className="pb-2 text-right font-mono">vs Par</th>
                  <th className="pb-2 text-right text-xs font-medium">No Bonus</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.leaderboard.map((e, i) => {
                  const key = e.matched_name ?? ''
                  return (
                    <ReviewLeaderboardRow
                      key={i}
                      entry={e}
                      ineligible={ineligiblePlayers.has(key)}
                      onToggle={() => setIneligiblePlayers((prev) => {
                        const next = new Set(prev)
                        next.has(key) ? next.delete(key) : next.add(key)
                        return next
                      })}
                    />
                  )
                })}
              </tbody>
            </table>
          </Section>

          {/* CTP */}
          <Section title="Closest to Pin">
            {(() => {
              const effectiveWinner = parsedData.ctp.find((e) => !ineligiblePlayers.has(e.matched_name ?? ''))
              return parsedData.ctp.map((e, i) => {
                const ineligible = ineligiblePlayers.has(e.matched_name ?? '')
                const isWinner = !ineligible && e === effectiveWinner
                return (
                  <div key={i} className={`text-sm flex items-center gap-2 ${ineligible ? 'opacity-50' : 'text-gray-700'}`}>
                    <span className={ineligible ? 'line-through' : ''}>
                      #{e.position} {e.name} → {e.matched_name ?? <span className="text-amber-600 font-medium">NEW</span>} | Hole {e.hole} | {e.distance}
                    </span>
                    {ineligible && <span className="text-xs font-medium text-amber-600 shrink-0">Ineligible</span>}
                    {isWinner && <span className="text-xs font-medium text-green-600 shrink-0">Winner</span>}
                  </div>
                )
              })
            })()}
          </Section>

          {/* LD */}
          <Section title="Longest Drive">
            {(() => {
              const effectiveWinner = parsedData.ld.find((e) => !ineligiblePlayers.has(e.matched_name ?? ''))
              return parsedData.ld.map((e, i) => {
                const ineligible = ineligiblePlayers.has(e.matched_name ?? '')
                const isWinner = !ineligible && e === effectiveWinner
                return (
                  <div key={i} className={`text-sm flex items-center gap-2 ${ineligible ? 'opacity-50' : 'text-gray-700'}`}>
                    <span className={ineligible ? 'line-through' : ''}>
                      #{e.position} {e.name} → {e.matched_name ?? <span className="text-amber-600 font-medium">NEW</span>} | Hole {e.hole} | {e.distance_yards}
                    </span>
                    {ineligible && <span className="text-xs font-medium text-amber-600 shrink-0">Ineligible</span>}
                    {isWinner && <span className="text-xs font-medium text-green-600 shrink-0">Winner</span>}
                  </div>
                )
              })
            })()}
          </Section>

          {parseError && <p className="text-red-500 text-sm mb-4">{parseError}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('upload'); setIneligiblePlayers(new Set()) }}
              className="flex-1 border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400 py-3 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Results saved!</h2>
          <p className="text-gray-500 mb-6">The leaderboard has been updated.</p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="bg-amber-400 hover:bg-amber-500 text-black font-semibold px-6 py-2.5 rounded-lg transition-colors">
              View Leaderboard
            </a>
            <button
              onClick={() => { setStep('upload'); setLbFile(null); setCtpFile(null); setLdFile(null) }}
              className="border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400 px-6 py-2.5 rounded-lg transition-colors"
            >
              Upload Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function ReviewLeaderboardRow({
  entry,
  ineligible,
  onToggle,
}: {
  entry: MatchedLeaderboardEntry
  ineligible: boolean
  onToggle: () => void
}) {
  return (
    <tr className={`border-b border-gray-100 transition-opacity ${ineligible ? 'opacity-40' : ''}`}>
      <td className="py-1.5 text-gray-500 font-mono">{entry.position}</td>
      <td className={`py-1.5 text-gray-700 ${ineligible ? 'line-through' : ''}`}>{entry.name}</td>
      <td className="py-1.5">
        {entry.is_new_player ? (
          <span className="text-amber-600 text-xs font-medium">NEW: {entry.matched_name}</span>
        ) : (
          <span className="text-green-600 text-xs">{entry.matched_name}</span>
        )}
      </td>
      <td className="py-1.5 text-right font-mono text-amber-600 font-semibold">{entry.stableford_score}</td>
      <td className="py-1.5 text-right font-mono text-gray-500">{entry.score_vs_par}</td>
      <td className="py-1.5 text-right">
        <input
          type="checkbox"
          checked={ineligible}
          onChange={onToggle}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </td>
    </tr>
  )
}
