'use client'

import { useState, useEffect } from 'react'
import { LogOut, X } from 'lucide-react'
import { UploadZone } from '@/components/UploadZone'
import { PlayerManagement } from '@/components/PlayerManagement'
import { CohortManagement } from '@/components/CohortManagement'
import { AdminManagement } from '@/components/AdminManagement'
import { supabase } from '@/lib/supabase'
import { isCurveballWeek, weeklyWinnerBonusPoints } from '@/lib/rules'
import { determineWeeklyWinner, determineWoodenSpoon } from '@/lib/weekly-winner'
import type { ParsedWeekData, MatchedLeaderboardEntry, MatchedCTPEntry, MatchedLDEntry } from '@/types'

type AdminStep = 'auth' | 'upload' | 'review' | 'done'

interface WeekOption {
  id: string
  week_number: number
  course_name: string
  date: string
  is_bye: boolean
  cohort_id: string | null
}

interface PlayerOption {
  id: string
  display_name: string
  aliases: string[]
}

function getOrphanIds(original: ParsedWeekData, current: ParsedWeekData): string[] {
  const originalNewIds = new Set<string>()
  for (const e of [...original.leaderboard, ...original.ctp, ...original.ld]) {
    if (e.is_new_player && e.matched_player_id) originalNewIds.add(e.matched_player_id)
  }
  const currentRefs = new Set<string>()
  for (const e of [...current.leaderboard, ...current.ctp, ...current.ld]) {
    if (e.matched_player_id) currentRefs.add(e.matched_player_id)
  }
  return [...originalNewIds].filter((id) => !currentRefs.has(id))
}

function filterPlayers(players: PlayerOption[], query: string): PlayerOption[] {
  const q = query.toLowerCase().trim()
  if (!q) return players
  return players.filter(
    (p) =>
      p.display_name.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q))
  )
}

export default function AdminPage() {
  const [step, setStep] = useState<AdminStep>('auth')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [selectedWeekId, setSelectedWeekId] = useState<string>('new')
  const [newCourseName, setNewCourseName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [selectedCohortId, setSelectedCohortId] = useState('')
  const [cohorts, setCohorts] = useState<{ id: string; name: string; status: string }[]>([])

  const [lbFile, setLbFile] = useState<File | null>(null)
  const [ctpFile, setCtpFile] = useState<File | null>(null)
  const [ldFile, setLdFile] = useState<File | null>(null)

  const [parsedData, setParsedData] = useState<ParsedWeekData | null>(null)
  const [originalParsedData, setOriginalParsedData] = useState<ParsedWeekData | null>(null)
  const [allPlayers, setAllPlayers] = useState<PlayerOption[]>([])
  const [reviewWeekId, setReviewWeekId] = useState<string>('')
  const [uploadIds, setUploadIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [ineligiblePlayers, setIneligiblePlayers] = useState<Set<string>>(new Set())
  const [dnfPlayers, setDnfPlayers] = useState<Set<string>>(new Set())
  // Admin's manual pick when Trackman itself couldn't break a weekly-winner tie.
  const [manualWinnerId, setManualWinnerId] = useState<string | null>(null)
  const [saveWeekLoading, setSaveWeekLoading] = useState(false)
  const [saveWeekSuccess, setSaveWeekSuccess] = useState(false)

  async function loadWeeksAndCohorts() {
    const [{ data: weeksData }, { data: cohortsData }] = await Promise.all([
      supabase.from('weeks').select('id, week_number, course_name, date, is_bye, cohort_id').order('date'),
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

      const [parseRes, playersRes] = await Promise.all([
        fetch('/api/parse-week', { method: 'POST', body: formData }),
        supabase
          .from('players')
          .select('id, display_name, player_aliases(alias)')
          .order('display_name'),
      ])

      if (!parseRes.ok) {
        const err = await parseRes.json()
        throw new Error(err.error ?? 'Parse failed')
      }

      const parsed = await parseRes.json()
      const weekData: ParsedWeekData = {
        leaderboard: parsed.leaderboard,
        ctp: parsed.ctp,
        ld: parsed.ld,
      }

      const initialDnf = new Set<string>(
        (parsed.leaderboard as MatchedLeaderboardEntry[])
          .filter((e) => e.dnf)
          .map((e) => e.matched_player_id ?? '')
          .filter(Boolean)
      )
      setDnfPlayers(initialDnf)
      setIneligiblePlayers(new Set(initialDnf))
      setManualWinnerId(null)
      setParsedData(weekData)
      setOriginalParsedData({ leaderboard: parsed.leaderboard, ctp: parsed.ctp, ld: parsed.ld })
      setReviewWeekId(parsed.week_id)
      setUploadIds(parsed.upload_ids ?? [])

      setAllPlayers(
        ((playersRes.data ?? []) as { id: string; display_name: string; player_aliases: { alias: string }[] }[]).map(
          (p) => ({
            id: p.id,
            display_name: p.display_name,
            aliases: (p.player_aliases ?? []).map((a) => a.alias),
          })
        )
      )

      setStep('review')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBack() {
    if (parsedData && originalParsedData) {
      const orphanIds = getOrphanIds(originalParsedData, parsedData)
      if (orphanIds.length > 0) {
        try {
          await fetch('/api/cleanup-orphans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_ids: orphanIds }),
          })
        } catch {
          // best-effort cleanup, don't block navigation
        }
      }
    }
    setStep('upload')
    setIneligiblePlayers(new Set())
    setDnfPlayers(new Set())
    setManualWinnerId(null)
    setParsedData(null)
    setOriginalParsedData(null)
  }

  async function handleConfirm() {
    if (!parsedData) return
    setSubmitting(true)
    try {
      if (originalParsedData) {
        const orphanIds = getOrphanIds(originalParsedData, parsedData)
        if (orphanIds.length > 0) {
          await fetch('/api/cleanup-orphans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_ids: orphanIds }),
          })
        }
      }

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
          dnf_players: Array.from(dnfPlayers),
          manual_winner_player_id: manualWinnerId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Confirm failed')
      }
      setManualWinnerId(null)
      setStep('done')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRename(oldPlayerId: string, newName: string) {
    setParsedData((prev) => {
      if (!prev) return prev
      const update = <T extends { matched_player_id: string | null; matched_name: string | null }>(e: T): T =>
        e.matched_player_id === oldPlayerId ? { ...e, matched_name: newName } : e
      return { leaderboard: prev.leaderboard.map(update), ctp: prev.ctp.map(update), ld: prev.ld.map(update) }
    })
  }

  function handleRemap(oldPlayerId: string, targetId: string, targetName: string) {
    setParsedData((prev) => {
      if (!prev) return prev
      const update = <T extends { matched_player_id: string | null; matched_name: string | null; is_new_player: boolean }>(e: T): T =>
        e.matched_player_id === oldPlayerId
          ? { ...e, matched_player_id: targetId, matched_name: targetName, is_new_player: false }
          : e
      return { leaderboard: prev.leaderboard.map(update), ctp: prev.ctp.map(update), ld: prev.ld.map(update) }
    })
  }

  function discardLeaderboardEntry(index: number) {
    setParsedData((prev) => prev ? { ...prev, leaderboard: prev.leaderboard.filter((_, i) => i !== index) } : prev)
  }

  function discardCtpEntry(index: number) {
    setParsedData((prev) => prev ? { ...prev, ctp: prev.ctp.filter((_, i) => i !== index) } : prev)
  }

  function discardLdEntry(index: number) {
    setParsedData((prev) => prev ? { ...prev, ld: prev.ld.filter((_, i) => i !== index) } : prev)
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
                    {w.is_bye ? ' (Bye)' : ''}
                    {isCurveballWeek(w.week_number) ? ' \uD83C\uDFB2 Curveball' : ''}
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
    const newPlayerIds = new Set<string>()
    for (const e of [...parsedData.leaderboard, ...parsedData.ctp, ...parsedData.ld]) {
      if (e.is_new_player && e.matched_player_id) newPlayerIds.add(e.matched_player_id)
    }

    // Weekly winner / Wooden Spoon preview — Max 40 rule (see lib/weekly-winner.ts).
    const reviewWeek = weeks.find((w) => w.id === reviewWeekId)
    const reviewCurveball = reviewWeek ? isCurveballWeek(reviewWeek.week_number) : false
    const winnerForRules = parsedData.leaderboard
      .filter((e) => e.matched_player_id)
      .map((e) => {
        const pid = e.matched_player_id!
        const isDnf = dnfPlayers.has(pid)
        return {
          player_id: pid,
          stableford_score: isDnf ? 0 : e.stableford_score,
          score_vs_par: isDnf ? null : e.score_vs_par,
          position: isDnf ? null : (e.position ?? null),
          ineligible_for_bonus: isDnf || ineligiblePlayers.has(pid),
        }
      })
    const weeklyWinner = determineWeeklyWinner(winnerForRules, manualWinnerId)
    const weeklySpoon = determineWoodenSpoon(winnerForRules)
    const weeklyWinnerPts = weeklyWinnerBonusPoints(reviewCurveball)
    const nameForPlayerId = (id: string) =>
      parsedData.leaderboard.find((e) => e.matched_player_id === id)?.matched_name
      ?? allPlayers.find((p) => p.id === id)?.display_name
      ?? '?'
    const tieUnresolved = weeklyWinner.tied

    return (
      <div className="min-h-screen bg-[#f9f9f9] text-gray-900 p-4">
        <div className="max-w-3xl mx-auto py-8">
          <h1 className="text-2xl font-bold text-amber-500 mb-2">Review Parsed Results</h1>
          <p className="text-gray-500 mb-4">Check the data below, then confirm to write to the database.</p>

          {newPlayerIds.size > 0 && (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <strong>{newPlayerIds.size} new player{newPlayerIds.size > 1 ? 's' : ''}</strong> auto-created from OCR.
              Review each below — rename, remap to existing, or discard the entry.
            </div>
          )}

          <Section title="Leaderboard">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="pb-2 text-left">#</th>
                  <th className="pb-2 text-left">Name (parsed)</th>
                  <th className="pb-2 text-left">Matched to</th>
                  <th className="pb-2 text-right font-mono">Score</th>
                  <th className="pb-2 text-right font-mono">vs Par</th>
                  <th className="pb-2 text-right text-xs font-medium">DNF</th>
                  <th className="pb-2 text-right text-xs font-medium">No Bonus</th>
                  <th className="pb-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {parsedData.leaderboard.map((e, i) => {
                  const key = e.matched_player_id ?? ''
                  const isDnf = dnfPlayers.has(key)
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
                      isDnf={isDnf}
                      onToggleDnf={() => {
                        if (isDnf) {
                          setDnfPlayers((prev) => { const n = new Set(prev); n.delete(key); return n })
                        } else {
                          setDnfPlayers((prev) => { const n = new Set(prev); n.add(key); return n })
                          setIneligiblePlayers((prev) => { const n = new Set(prev); n.add(key); return n })
                        }
                      }}
                      onDiscard={() => discardLeaderboardEntry(i)}
                      allPlayers={allPlayers}
                      onRename={handleRename}
                      onRemap={handleRemap}
                    />
                  )
                })}
              </tbody>
            </table>
          </Section>

          <div className={`mb-6 p-3 rounded-lg text-sm border ${
            tieUnresolved ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {weeklyWinner.winnerIds.length === 0 ? (
              <>No bonus-eligible players this week — no weekly winner to award.</>
            ) : tieUnresolved ? (
              <>
                <p className="mb-2">
                  🏆 Weekly winner tied between{' '}
                  <strong>{weeklyWinner.winnerIds.map(nameForPlayerId).join(' and ')}</strong> —
                  Trackman itself couldn&apos;t split them (same position and gross score). Pick
                  the winner below before confirming:
                </p>
                <div className="flex flex-wrap gap-2">
                  {weeklyWinner.winnerIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setManualWinnerId(id)}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-100 transition-colors"
                    >
                      {nameForPlayerId(id)} wins
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                🏆 {nameForPlayerId(weeklyWinner.winnerIds[0])} wins the week (+{weeklyWinnerPts} pt{weeklyWinnerPts > 1 ? 's' : ''}
                {reviewCurveball ? ' — Curveball Week' : ''}) and picks next week&apos;s course.
                {manualWinnerId === weeklyWinner.winnerIds[0] && (
                  <button
                    type="button"
                    onClick={() => setManualWinnerId(null)}
                    className="ml-2 text-xs underline text-amber-600 hover:text-amber-800"
                  >
                    undo manual pick
                  </button>
                )}
              </>
            )}
            {weeklySpoon.spoonIds.length > 0 && (
              <div className="mt-1 text-amber-600/80">
                🥄 Wooden Spoon: {weeklySpoon.spoonIds.map(nameForPlayerId).join(', ')}
              </div>
            )}
          </div>

          <Section title="Closest to Pin">
            {(() => {
              const effectiveWinner = parsedData.ctp.find((e) => !ineligiblePlayers.has(e.matched_player_id ?? ''))
              return parsedData.ctp.map((e, i) => (
                <ReviewCTPRow
                  key={i}
                  entry={e}
                  ineligible={ineligiblePlayers.has(e.matched_player_id ?? '')}
                  isWinner={!ineligiblePlayers.has(e.matched_player_id ?? '') && e === effectiveWinner}
                  onDiscard={() => discardCtpEntry(i)}
                  allPlayers={allPlayers}
                  onRename={handleRename}
                  onRemap={handleRemap}
                />
              ))
            })()}
          </Section>

          <Section title="Longest Drive">
            {(() => {
              const effectiveWinner = parsedData.ld.find((e) => !ineligiblePlayers.has(e.matched_player_id ?? ''))
              return parsedData.ld.map((e, i) => (
                <ReviewLDRow
                  key={i}
                  entry={e}
                  ineligible={ineligiblePlayers.has(e.matched_player_id ?? '')}
                  isWinner={!ineligiblePlayers.has(e.matched_player_id ?? '') && e === effectiveWinner}
                  onDiscard={() => discardLdEntry(i)}
                  allPlayers={allPlayers}
                  onRename={handleRename}
                  onRemap={handleRemap}
                />
              ))
            })()}
          </Section>

          {parseError && <p className="text-red-500 text-sm mb-4">{parseError}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="flex-1 border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400 py-3 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || tieUnresolved}
              title={tieUnresolved ? 'Pick a weekly winner above before confirming' : undefined}
              className="flex-1 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? 'Saving…' : tieUnresolved ? 'Resolve tie to continue' : 'Confirm & Save'}
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

// --- Sub-components ---

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
  isDnf,
  onToggleDnf,
  onDiscard,
  allPlayers,
  onRename,
  onRemap,
}: {
  entry: MatchedLeaderboardEntry
  ineligible: boolean
  onToggle: () => void
  isDnf: boolean
  onToggleDnf: () => void
  onDiscard: () => void
  allPlayers: PlayerOption[]
  onRename: (oldId: string, newName: string) => void
  onRemap: (oldId: string, targetId: string, targetName: string) => void
}) {
  return (
    <tr className={`border-b border-gray-100 transition-opacity discard-row ${isDnf || ineligible ? 'opacity-40' : ''}`}>
      <td className="py-1.5 text-gray-500 font-mono">{isDnf ? 'DNF' : entry.position}</td>
      <td className={`py-1.5 text-gray-700 ${isDnf || ineligible ? 'line-through' : ''}`}>{entry.name}</td>
      <td className="py-1.5">
        <PlayerMatchCell
          entry={entry}
          allPlayers={allPlayers}
          onRename={onRename}
          onRemap={onRemap}
        />
      </td>
      <td className="py-1.5 text-right font-mono text-amber-600 font-semibold">
        {isDnf ? '0' : entry.stableford_score}
      </td>
      <td className="py-1.5 text-right font-mono text-gray-500">
        {isDnf ? '–' : entry.score_vs_par}
      </td>
      <td className="py-1.5 text-right">
        <input
          type="checkbox"
          checked={isDnf}
          onChange={onToggleDnf}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </td>
      <td className="py-1.5 text-right">
        <input
          type="checkbox"
          checked={ineligible}
          onChange={onToggle}
          disabled={isDnf}
          className="w-4 h-4 accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </td>
      <td className="py-1.5 text-right w-6">
        <button
          onClick={onDiscard}
          title="Discard entry"
          className="discard-btn text-gray-400 hover:text-red-500 transition-colors"
        >
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

function ReviewCTPRow({
  entry,
  ineligible,
  isWinner,
  onDiscard,
  allPlayers,
  onRename,
  onRemap,
}: {
  entry: MatchedCTPEntry
  ineligible: boolean
  isWinner: boolean
  onDiscard: () => void
  allPlayers: PlayerOption[]
  onRename: (oldId: string, newName: string) => void
  onRemap: (oldId: string, targetId: string, targetName: string) => void
}) {
  return (
    <div className={`text-sm flex items-center gap-2 py-1 discard-row ${ineligible ? 'opacity-50' : 'text-gray-700'}`}>
      <span className={`flex-1 ${ineligible ? 'line-through' : ''}`}>
        #{entry.position} {entry.name} | Hole {entry.hole} | {entry.distance}
      </span>
      <PlayerMatchCell entry={entry} allPlayers={allPlayers} onRename={onRename} onRemap={onRemap} />
      {ineligible && <span className="text-xs font-medium text-amber-600 shrink-0">Ineligible</span>}
      {isWinner && <span className="text-xs font-medium text-green-600 shrink-0">Winner</span>}
      <button
        onClick={onDiscard}
        title="Discard entry"
        className="discard-btn text-gray-400 hover:text-red-500 transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function ReviewLDRow({
  entry,
  ineligible,
  isWinner,
  onDiscard,
  allPlayers,
  onRename,
  onRemap,
}: {
  entry: MatchedLDEntry
  ineligible: boolean
  isWinner: boolean
  onDiscard: () => void
  allPlayers: PlayerOption[]
  onRename: (oldId: string, newName: string) => void
  onRemap: (oldId: string, targetId: string, targetName: string) => void
}) {
  return (
    <div className={`text-sm flex items-center gap-2 py-1 discard-row ${ineligible ? 'opacity-50' : 'text-gray-700'}`}>
      <span className={`flex-1 ${ineligible ? 'line-through' : ''}`}>
        #{entry.position} {entry.name} | Hole {entry.hole} | {entry.distance_yards}
      </span>
      <PlayerMatchCell entry={entry} allPlayers={allPlayers} onRename={onRename} onRemap={onRemap} />
      {ineligible && <span className="text-xs font-medium text-amber-600 shrink-0">Ineligible</span>}
      {isWinner && <span className="text-xs font-medium text-green-600 shrink-0">Winner</span>}
      <button
        onClick={onDiscard}
        title="Discard entry"
        className="discard-btn text-gray-400 hover:text-red-500 transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}

type MatchedEntry = MatchedLeaderboardEntry | MatchedCTPEntry | MatchedLDEntry

function PlayerMatchCell({
  entry,
  allPlayers,
  onRename,
  onRemap,
}: {
  entry: MatchedEntry
  allPlayers: PlayerOption[]
  onRename: (oldId: string, newName: string) => void
  onRemap: (oldId: string, targetId: string, targetName: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'remap'>('view')
  const [renameVal, setRenameVal] = useState(entry.matched_name ?? '')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [remapFilter, setRemapFilter] = useState('')
  const [remapLoading, setRemapLoading] = useState(false)
  const [remapError, setRemapError] = useState('')

  if (!entry.is_new_player) {
    return <span className="text-green-600 text-xs">{entry.matched_name}</span>
  }

  async function doRename() {
    if (!entry.matched_player_id) return
    setRenameLoading(true)
    setRenameError('')
    try {
      const res = await fetch('/api/rename-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: entry.matched_player_id, display_name: renameVal }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRenameError(data.error ?? 'Failed to rename')
        return
      }
      onRename(entry.matched_player_id, data.display_name)
      setMode('view')
    } finally {
      setRenameLoading(false)
    }
  }

  async function doRemap(targetId: string, targetName: string) {
    if (!entry.matched_player_id) return
    setRemapLoading(true)
    setRemapError('')
    try {
      const res = await fetch('/api/remap-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: entry.matched_player_id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRemapError(data.error ?? 'Failed to remap')
        return
      }
      onRemap(entry.matched_player_id, targetId, targetName)
      setMode('view')
    } finally {
      setRemapLoading(false)
    }
  }

  if (mode === 'rename') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <input
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doRename()
            if (e.key === 'Escape') setMode('view')
          }}
          className="text-xs border border-gray-300 rounded px-2 py-1 w-32 focus:outline-none focus:border-amber-400"
          autoFocus
        />
        <button
          onClick={doRename}
          disabled={renameLoading}
          className="text-xs bg-amber-400 hover:bg-amber-500 text-black px-2 py-0.5 rounded disabled:opacity-50"
        >
          {renameLoading ? '…' : 'Save'}
        </button>
        <button onClick={() => setMode('view')} className="text-xs text-gray-400 hover:text-gray-600">
          ✕
        </button>
        {renameError && <span className="text-xs text-red-500 w-full">{renameError}</span>}
      </div>
    )
  }

  if (mode === 'remap') {
    const filtered = filterPlayers(allPlayers, remapFilter).slice(0, 8)
    return (
      <div className="relative">
        <div className="flex items-center gap-1">
          <input
            value={remapFilter}
            onChange={(e) => setRemapFilter(e.target.value)}
            placeholder="Search player…"
            className="text-xs border border-gray-300 rounded px-2 py-1 w-36 focus:outline-none focus:border-amber-400"
            autoFocus
          />
          <button onClick={() => setMode('view')} className="text-xs text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {remapError && <span className="text-xs text-red-500 block mt-0.5">{remapError}</span>}
        {filtered.length > 0 && (
          <div className="absolute left-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-md w-48 max-h-44 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => doRemap(p.id, p.display_name)}
                disabled={remapLoading}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 transition-colors"
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // mode === 'view' for new player
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">NEW</span>
      <span className="text-xs text-gray-700">{entry.matched_name}</span>
      <button
        onClick={() => { setRenameVal(entry.matched_name ?? ''); setMode('rename') }}
        className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
      >
        Rename
      </button>
      <button
        onClick={() => { setRemapFilter(''); setMode('remap') }}
        className="text-xs text-purple-500 hover:text-purple-700 transition-colors"
      >
        Remap
      </button>
    </div>
  )
}
