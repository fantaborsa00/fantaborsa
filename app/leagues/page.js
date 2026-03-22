'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function generateLeagueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function LeaguesPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  const [leagueName, setLeagueName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [createSuccess, setCreateSuccess] = useState(null)

  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [joinSuccess, setJoinSuccess] = useState(null)

  const [myPortfolios, setMyPortfolios] = useState([])
  const [myLeaguesLoading, setMyLeaguesLoading] = useState(false)

  const loadMyLeagues = useCallback(async (uid) => {
    if (!uid) {
      setMyPortfolios([])
      setMyLeaguesLoading(false)
      return
    }
    setMyLeaguesLoading(true)
    const { data, error } = await supabase
      .from('portfolios')
      .select('id, league_id, leagues ( name )')
      .eq('user_id', uid)

    if (!error && data) {
      setMyPortfolios(data)
    } else {
      const { data: basic } = await supabase
        .from('portfolios')
        .select('id, league_id')
        .eq('user_id', uid)
      setMyPortfolios(basic ?? [])
    }
    setMyLeaguesLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadMyLeagues(user?.id)
  }, [user?.id, loadMyLeagues])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(null)

    if (!user) {
      setCreateError('Devi effettuare il login per creare una lega.')
      return
    }

    const name = leagueName.trim()
    if (!name) {
      setCreateError('Inserisci il nome della lega.')
      return
    }

    setCreateLoading(true)

    let lastError = null
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateLeagueCode()
      const { data: created, error } = await supabase
        .from('leagues')
        .insert({
          name,
          code,
          creator_id: user.id,
        })
        .select('id')
        .single()

      if (!error && created?.id) {
        setLeagueName('')
        setCreateLoading(false)
        router.push(`/leagues/${created.id}`)
        return
      }

      lastError = error
      if (error?.code !== '23505') break
    }

    setCreateError(lastError?.message ?? 'Impossibile creare la lega.')
    setCreateLoading(false)
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    setJoinError(null)
    setJoinSuccess(null)

    if (!user) {
      setJoinError('Devi effettuare il login per unirti a una lega.')
      return
    }

    const code = joinCode.trim().toUpperCase().replace(/[^A-Z]/g, '')
    if (code.length !== 6) {
      setJoinError('Il codice deve essere di 6 lettere maiuscole.')
      return
    }

    setJoinLoading(true)

    const { data: league, error: findError } = await supabase
      .from('leagues')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (findError) {
      setJoinError(findError.message)
      setJoinLoading(false)
      return
    }

    if (!league) {
      setJoinError('Nessuna lega trovata con questo codice.')
      setJoinLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('portfolios').insert({
      league_id: league.id,
      user_id: user.id,
      cash_remaining: 10000,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        setJoinError('Hai già un portfolio in questa lega.')
      } else {
        setJoinError(insertError.message)
      }
    } else {
      setJoinSuccess('Ti sei unito alla lega. Portfolio creato con 10.000 di cash disponibile.')
      setJoinCode('')
      await loadMyLeagues(user.id)
      router.push('/trade')
    }

    setJoinLoading(false)
  }

  const portfoliosWithLeague = myPortfolios.filter((p) => p.league_id)

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <h1 className="text-center text-2xl font-semibold text-gray-800">
          Leghe
        </h1>

        <section className="rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-4 text-lg font-medium text-gray-800">
            Le mie leghe
          </h2>
          {!user && (
            <p className="text-sm text-gray-600">
              Accedi per vedere le tue leghe.
            </p>
          )}
          {user && myLeaguesLoading && (
            <p className="text-sm text-gray-600">Caricamento…</p>
          )}
          {user && !myLeaguesLoading && portfoliosWithLeague.length === 0 && (
            <p className="text-sm text-gray-600">
              Non sei ancora in nessuna lega.
            </p>
          )}
          {user && !myLeaguesLoading && portfoliosWithLeague.length > 0 && (
            <ul className="space-y-3">
              {portfoliosWithLeague.map((p) => {
                const name =
                  p.leagues?.name ||
                  `Lega ${String(p.league_id).slice(0, 8)}…`
                return (
                  <li key={p.id}>
                    <Link
                      href={`/leagues/${p.league_id}`}
                      className="block rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm transition hover:border-blue-400 hover:bg-blue-50"
                    >
                      <span className="font-medium text-gray-900">
                        {name}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-4 text-lg font-medium text-gray-800">
            Crea una nuova lega
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="league-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Nome lega
              </label>
              <input
                id="league-name"
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Es. Lega degli amici"
                autoComplete="off"
              />
            </div>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            {createSuccess && (
              <p className="text-sm text-green-600">{createSuccess}</p>
            )}
            <button
              type="submit"
              disabled={createLoading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {createLoading ? 'Creazione…' : 'Crea'}
            </button>
          </form>
        </section>

        <section className="rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-4 text-lg font-medium text-gray-800">
            Unisciti a una lega
          </h2>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label
                htmlFor="join-code"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Codice lega (6 lettere)
              </label>
              <input
                id="join-code"
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono uppercase tracking-widest shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ABCDEF"
                autoComplete="off"
              />
            </div>
            {joinError && <p className="text-sm text-red-600">{joinError}</p>}
            {joinSuccess && (
              <p className="text-sm text-green-600">{joinSuccess}</p>
            )}
            <button
              type="submit"
              disabled={joinLoading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {joinLoading ? 'Attendere…' : 'Unisciti'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
