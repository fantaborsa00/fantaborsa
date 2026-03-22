'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function initialUsernameInput(user, profileUsername) {
  if (profileUsername) return profileUsername
  const m = user?.user_metadata
  return (
    m?.username ||
    m?.preferred_username ||
    m?.full_name ||
    m?.name ||
    ''
  )
}

export default function AccountPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profileUsername, setProfileUsername] = useState(null)
  const [usernameInput, setUsernameInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile(uid) {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', uid)
        .maybeSingle()
      if (!cancelled) {
        setProfileUsername(data?.username ?? null)
      }
    }

    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (cancelled) return
      if (!u) {
        router.replace('/login')
        setLoading(false)
        return
      }
      setUser(u)
      await loadProfile(u.id)
      if (!cancelled) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      const next = session?.user ?? null
      if (!next) {
        router.replace('/login')
        setUser(null)
        setProfileUsername(null)
        setLoading(false)
        return
      }
      setUser(next)
      loadProfile(next.id)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (loading || !user) return
    setUsernameInput(initialUsernameInput(user, profileUsername))
  }, [loading, user?.id, profileUsername])

  const handleSaveUsername = async () => {
    setSaveMessage(null)
    setSaveError(null)
    const name = usernameInput.trim()
    if (!name) {
      setSaveError('Lo username non può essere vuoto.')
      return
    }
    setSaveLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({ username: name })
      .eq('id', user.id)
    setSaveLoading(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setProfileUsername(name)
    setSaveMessage('Username aggiornato.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-100 py-10 px-4">
        <div className="mx-auto max-w-md rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-sm text-gray-600">Caricamento…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-semibold text-gray-800">
          Account
        </h1>

        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium text-gray-600">Email</dt>
            <dd className="mt-1 text-gray-900">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="mb-1 font-medium text-gray-600">Username</dt>
            <dd className="mt-1">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="username"
              />
            </dd>
            {saveError && (
              <p className="mt-2 text-sm text-red-600">{saveError}</p>
            )}
            {saveMessage && (
              <p className="mt-2 text-sm text-green-600">{saveMessage}</p>
            )}
            <button
              type="button"
              onClick={handleSaveUsername}
              disabled={saveLoading}
              className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {saveLoading ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </dl>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
