'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const INITIAL_CAPITAL = 10000

function formatNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n))
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)} %`
}

async function fetchQuote(ticker) {
  const q = encodeURIComponent(String(ticker).trim())
  const res = await fetch(`/api/price?ticker=${q}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ticker, price: 0, ok: false }
  }
  return {
    ticker: data.ticker,
    price: Number(data.price),
    ok: true,
  }
}

function labelForRow(portfolio, currentUser, profileUsername) {
  if (profileUsername) return profileUsername
  if (currentUser && portfolio.user_id === currentUser.id) {
    return (
      currentUser.user_metadata?.username ||
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split('@')[0] ||
      'Tu'
    )
  }
  return `Giocatore ${String(portfolio.user_id).slice(0, 8)}…`
}

export default function LeagueLeaderboardPage() {
  const params = useParams()
  const leagueId = params?.id

  const [currentUser, setCurrentUser] = useState(null)
  const [leagueName, setLeagueName] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadLeaderboard = useCallback(async () => {
    if (!leagueId) return

    setError(null)
    setLoading(true)

    try {
      const { data: league, error: leagueErr } = await supabase
        .from('leagues')
        .select('name')
        .eq('id', leagueId)
        .maybeSingle()

      if (leagueErr) throw new Error(leagueErr.message)
      setLeagueName(league?.name ?? null)

      let { data: portfolios, error: pErr } = await supabase
        .from('portfolios')
        .select('id, user_id, cash_remaining, profiles ( username )')
        .eq('league_id', leagueId)

      if (pErr) {
        const retry = await supabase
          .from('portfolios')
          .select('id, user_id, cash_remaining')
          .eq('league_id', leagueId)
        if (retry.error) throw new Error(retry.error.message)
        portfolios = retry.data
      }

      const list = portfolios ?? []
      if (list.length === 0) {
        setRows([])
        setLastUpdated(new Date())
        setLoading(false)
        return
      }

      const portfolioIds = list.map((p) => p.id)

      const { data: allPositions, error: posErr } = await supabase
        .from('positions')
        .select('portfolio_id, ticker, shares')
        .in('portfolio_id', portfolioIds)

      if (posErr) throw new Error(posErr.message)

      const byPortfolio = new Map()
      for (const pid of portfolioIds) {
        byPortfolio.set(pid, [])
      }
      for (const pos of allPositions ?? []) {
        const arr = byPortfolio.get(pos.portfolio_id)
        if (arr) arr.push(pos)
      }

      const tickers = new Set()
      for (const pos of allPositions ?? []) {
        if (pos.ticker) tickers.add(String(pos.ticker).trim().toUpperCase())
      }

      const priceMap = new Map()
      await Promise.all(
        [...tickers].map(async (t) => {
          const r = await fetchQuote(t)
          priceMap.set(t, r.price)
        })
      )

      const computed = list.map((p) => {
        const positions = byPortfolio.get(p.id) ?? []
        let positionsValue = 0
        for (const pos of positions) {
          const t = String(pos.ticker).trim().toUpperCase()
          const sh = Number(pos.shares)
          const px = priceMap.get(t) ?? 0
          if (Number.isFinite(sh) && Number.isFinite(px)) {
            positionsValue += sh * px
          }
        }
        const cash = Number(p.cash_remaining) || 0
        const total = cash + positionsValue
        const pctVsInitial =
          ((total - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100

        const profileUsername =
          p.profiles?.username ??
          (Array.isArray(p.profiles) ? p.profiles[0]?.username : null)

        return {
          portfolioId: p.id,
          userId: p.user_id,
          profileUsername,
          total,
          pctVsInitial,
          positionsValue,
          cash,
        }
      })

      computed.sort((a, b) => b.total - a.total)

      setRows(
        computed.map((r, i) => ({
          ...r,
          rank: i + 1,
          isLeader: i === 0,
        }))
      )
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message || 'Errore nel caricamento della classifica')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  useEffect(() => {
    if (!leagueId) return
    const id = setInterval(() => {
      loadLeaderboard()
    }, 60_000)
    return () => clearInterval(id)
  }, [leagueId, loadLeaderboard])

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-2xl font-semibold text-gray-800">
          Classifica lega
        </h1>
        {leagueName && (
          <p className="mt-1 text-center text-sm text-gray-600">{leagueName}</p>
        )}
        {lastUpdated && !loading && (
          <p className="mt-1 text-center text-xs text-gray-500">
            Aggiornato alle{' '}
            {lastUpdated.toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}{' '}
            · refresh ogni 60 s
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {loading && rows.length === 0 && !error && (
          <p className="mt-8 text-center text-sm text-gray-600">
            Caricamento classifica…
          </p>
        )}

        {!loading && rows.length === 0 && !error && (
          <p className="mt-8 text-center text-sm text-gray-600">
            Nessun portfolio in questa lega.
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-lg bg-white shadow-md">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-3">Pos.</th>
                  <th className="px-4 py-3">Utente</th>
                  <th className="px-4 py-3 text-right">Valore totale</th>
                  <th className="px-4 py-3 text-right">vs 10.000</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const positive = r.pctVsInitial >= 0
                  return (
                    <tr
                      key={r.portfolioId}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {r.rank}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          positive ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {r.isLeader && (
                          <span className="mr-1.5" title="Leader">
                            👑
                          </span>
                        )}
                        {labelForRow(
                          { user_id: r.userId },
                          currentUser,
                          r.profileUsername
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          positive ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatNumber(r.total)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          positive ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatPct(r.pctVsInitial)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
