import { useCallback, useEffect, useState } from 'react'
import { SearchBar } from './components/SearchBar'
import { LiveGame } from './components/LiveGame'
import { MatchHistory } from './components/MatchHistory'
import { ApiError, getAccount } from './lib/api'
import type { AccountDto } from './lib/types'
import { useDdragon } from './hooks/useDdragon'

type Tab = 'live' | 'history'

interface Query {
  riotId: string
  region: string
}

function readInitialQuery(): Query {
  const p = new URLSearchParams(window.location.search)
  return {
    riotId: p.get('riot') || localStorage.getItem('riotId') || '',
    region: p.get('region') || localStorage.getItem('region') || 'NA',
  }
}

function parseRiotId(v: string): { gameName: string; tagLine: string } | null {
  const m = v.trim().match(/^(.+)#([A-Za-z0-9]{2,5})$/)
  return m ? { gameName: m[1].trim(), tagLine: m[2] } : null
}

export default function App() {
  const dd = useDdragon()
  const [{ riotId, region }, setQuery] = useState<Query>(readInitialQuery)
  const [tab, setTab] = useState<Tab>('history')
  const [account, setAccount] = useState<AccountDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback((nextRiotId: string, nextRegion: string) => {
    setQuery({ riotId: nextRiotId, region: nextRegion })
  }, [])

  useEffect(() => {
    localStorage.setItem('riotId', riotId)
    localStorage.setItem('region', region)
    const p = new URLSearchParams()
    if (riotId) p.set('riot', riotId)
    p.set('region', region)
    window.history.replaceState(null, '', `?${p.toString()}`)

    const parsed = parseRiotId(riotId)
    if (!parsed) {
      setAccount(null)
      setError(riotId ? 'Enter a Riot ID like "Faker#KR1".' : null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    getAccount(region, parsed.gameName, parsed.tagLine)
      .then((a) => {
        if (cancelled) return
        setAccount(a)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setAccount(null)
        setError(err instanceof ApiError ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [riotId, region])

  return (
    <div className="app">
      <header>
        <h1>LoL Teammate Tracker</h1>
        <SearchBar riotId={riotId} region={region} onSearch={search} />
      </header>

      {loading && <p className="muted">Looking up summoner...</p>}
      {error && <div className="error">{error}</div>}

      {account && (
        <>
          <p className="resolved">
            {account.gameName}
            <span className="tag">#{account.tagLine}</span>
          </p>
          <nav className="tabs">
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              Match History
            </button>
            <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
              Live Game
            </button>
          </nav>
          {tab === 'live' ? (
            <LiveGame region={region} puuid={account.puuid} dd={dd} />
          ) : (
            <MatchHistory region={region} puuid={account.puuid} dd={dd} />
          )}
        </>
      )}

      <footer className="muted small">
        LoL Teammate Tracker isn't endorsed by Riot Games. Champion data via Data Dragon.
      </footer>
    </div>
  )
}
