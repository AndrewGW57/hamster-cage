import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase'
import { AdminButton } from '@/components/AdminButton'
import { RulesEditor } from '@/components/RulesEditor'

export const dynamic = 'force-dynamic'

export default async function RulesPage() {
  const db = createServiceClient()

  const [
    { data: cohorts },
    { data: ldPlayers },
    { data: contentRow },
  ] = await Promise.all([
    db.from('cohorts').select('id, name, status, total_weeks, scores_to_count, min_rounds_to_rank').order('created_at'),
    db.from('players').select('display_name, ld_handicap_yards').gt('ld_handicap_yards', 0).order('display_name'),
    db.from('site_content').select('value').eq('key', 'rules_notes').maybeSingle(),
  ])

  const activeCohort = (cohorts ?? []).find((c) => c.status === 'active') ?? null
  const rulesNotes = contentRow?.value ?? ''

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Site header */}
        <div className="mb-8">
          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            <div className="flex justify-end gap-2">
              <a href="/rules" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Rules</a>
              <AdminButton />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-center items-center">
                <Image src="/hamster-logo.jpg" alt="The Hamster Cage" height={80} width={80} className="h-20 w-auto" style={{ width: 'auto' }} priority loading="eager" />
              </div>
              <div className="flex flex-col justify-center items-center">
                <span className="text-[10px] text-[#9ca3af] mb-1">Sponsored by</span>
                <Image src="/sponsor-lochwild.jpg" alt="Loch Wild" height={60} width={180} className="h-[60px] w-auto" style={{ width: 'auto' }} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-amber-500">The Hamster Cage</h1>
              <p className="text-gray-600 mt-1">Order of Ferret Leaderboard 2026</p>
              <p className="text-gray-400 text-sm mt-0.5">Five Irons Golf Dubai</p>
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden sm:flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Image src="/hamster-logo.jpg" alt="The Hamster Cage" height={40} width={40} className="h-10 w-auto shrink-0" style={{ width: 'auto' }} priority loading="eager" />
              <div>
                <h1 className="text-3xl font-bold text-amber-500">The Hamster Cage</h1>
                <p className="text-gray-600 mt-1">Order of Ferret Leaderboard 2026</p>
                <p className="text-gray-400 text-sm mt-0.5">Five Irons Golf Dubai</p>
              </div>
            </div>
            <div className="flex flex-col items-end mt-1 ml-4 shrink-0">
              <div className="flex items-center gap-2">
                <a href="/rules" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Rules</a>
                <AdminButton />
              </div>
              <div className="flex flex-col items-end mt-8">
                <span className="text-xs text-[#9ca3af]">Sponsored by</span>
                <Image src="/sponsor-lochwild.jpg" alt="Loch Wild" height={120} width={360} className="h-[120px] w-auto mt-0.5" style={{ width: 'auto' }} />
              </div>
            </div>
          </div>
        </div>

        <a href="/" className="inline-flex items-center gap-1 text-sm text-amber-500 hover:text-amber-600 mb-8">
          ← Back to Leaderboard
        </a>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">Competition Rules</h2>

        <div className="space-y-4">

          {/* Current cohort settings */}
          {activeCohort && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">
                Current Cohort
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cohort</dt>
                  <dd className="font-medium text-gray-800">
                    {activeCohort.name}
                    <span className="ml-2 text-xs text-green-600 font-normal">Active</span>
                  </dd>
                </div>
                {activeCohort.total_weeks > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Total weeks</dt>
                    <dd className="font-medium text-gray-800">{activeCohort.total_weeks}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Scores that count</dt>
                  <dd className="font-medium text-gray-800 text-right">
                    <div>
                      Best {activeCohort.scores_to_count} score{activeCohort.scores_to_count !== 1 ? 's' : ''} count toward your total
                    </div>
                    <div className="text-xs font-normal text-gray-400 mt-0.5">
                      with a minimum of one Curveball week
                    </div>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Ranked threshold</dt>
                  <dd className="font-medium text-gray-800">
                    Play at least {activeCohort.min_rounds_to_rank} round{activeCohort.min_rounds_to_rank !== 1 ? 's' : ''} to appear on the leaderboard
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Scoring */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">
              Scoring
            </h3>
            <p className="text-sm text-gray-700 mb-4">Scores are recorded using the Stableford system:</p>
            <table className="w-full text-sm mb-4">
              <tbody>
                {[
                  ['Albatross', 5],
                  ['Eagle', 4],
                  ['Birdie', 3],
                  ['Par', 2],
                  ['Bogey', 1],
                  ['Double Bogey and above', 0],
                ].map(([label, pts]) => (
                  <tr key={label as string} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 text-gray-700">{label}</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-amber-600">{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Trackman assigns each player their Course Handicap and points are awarded based on
              your Net Score per hole. Less strokes = Higher Score = making it onto the Leaderboard!
            </p>
            {activeCohort && (
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                Your total for this cohort is the sum of your{' '}
                {activeCohort.scores_to_count === activeCohort.total_weeks
                  ? 'all rounds'
                  : <>best {activeCohort.scores_to_count} rounds</>}
                .
              </p>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 leading-relaxed mb-3">
              <strong>Max 40:</strong> the most points that count toward your total in any single
              week is 40. Score higher and it is very well played, but 40 is what goes into the
              books. If two or more players are tied on 40 or more, the weekly winner is whoever
              has the lowest gross score. Ties below 40 points go to standard countback: back 9,
              back 6, back 3.
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-sm text-purple-800 leading-relaxed mb-3">
              <strong>🎲 Curveball Weeks:</strong> weeks 3, 6, 9 and 12 of each cohort throw
              something different into the mix — smaller gimmies, faster greens, longer tees or
              more wind. At least one of your counting scores for the season must come from a
              Curveball week. If it doesn&apos;t happen naturally, your weakest counting round is
              swapped for your best Curveball round instead, even if that lowers your total. Never
              posted a Curveball score at all? You simply count one fewer round for the season.
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 leading-relaxed">
              If you play outside of the normal Hamster Cage hours (i.e. NOT the morning!), you can
              earn your Stableford points but you are not eligible for any bonus points: Making the
              Crop, Closest to the Pin, Longest Drive or the Weekly winner bonus. If, by chance, you
              ended up in first place on the Leaderboard, you will not get to choose the next
              week&apos;s course either.
            </div>
          </div>

          {/* Bonus points */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">
              Bonus Points
            </h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="pb-2 text-left font-medium">Contest</th>
                  <th className="pb-2 text-left font-medium">Award</th>
                  <th className="pb-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">🏆 Weekly Stableford winner</td>
                  <td className="py-2 text-gray-500">Per week (2 on Curveball weeks)</td>
                  <td className="py-2 text-right font-mono font-semibold text-amber-600">+1 / +2</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">📍 Closest to Pin</td>
                  <td className="py-2 text-gray-500">Per week</td>
                  <td className="py-2 text-right font-mono font-semibold text-amber-600">+2</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">🏌️ Longest Drive</td>
                  <td className="py-2 text-gray-500">Per week</td>
                  <td className="py-2 text-right font-mono font-semibold text-amber-600">+2</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-gray-800">Making the Crop (Top 10)</td>
                  <td className="py-2 text-gray-500">Per week</td>
                  <td className="py-2 text-right font-mono font-semibold text-amber-600">+1</td>
                </tr>
              </tbody>
            </table>
            <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
              <li>Bonus points are cumulative across all weeks in the cohort.</li>
              <li>You do not need to play every week to qualify.</li>
              <li>
                Every bonus point banks toward your season total regardless of whether that
                week&apos;s Stableford score ends up being one of your counting rounds.
              </li>
              <li>
                🥄 Wooden Spoon marks the lowest score of the week on the leaderboard grid — a badge
                of shame only, it carries no points.
              </li>
            </ul>
          </div>

          {/* LD handicap */}
          {ldPlayers && ldPlayers.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">
                Longest Drive Handicap
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                The following players have a distance deducted from their raw Longest Drive measurement
                before rankings are determined each week.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-200">
                    <th className="pb-2 text-left font-medium">Player</th>
                    <th className="pb-2 text-right font-medium">Handicap</th>
                  </tr>
                </thead>
                <tbody>
                  {ldPlayers.map((p) => (
                    <tr key={p.display_name} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-800">{p.display_name}</td>
                      <td className="py-2 text-right font-mono text-gray-500">−{p.ld_handicap_yards} yds</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Admin-editable notes */}
          <RulesEditor initialNotes={rulesNotes} />

        </div>
      </div>
    </main>
  )
}
