import { useEffect, useMemo, useState } from 'react'
import { ApiError, getMatchCached, getMatchIds } from '../lib/api'
import { runLimited } from '../lib/async'
import { queueName } from '../lib/queues'
import type { Ddragon } from '../lib/ddragon'
import type { MatchDto, MatchParticipant } from '../lib/types'
import { CONFIG } from '../lib/rating'
import { ratingKey, usePlayerRatings, type RatingRequest } from '../hooks/usePlayerRatings'
import { PlayerRow } from './PlayerRow'
import { PlayerScorecard } from './PlayerScorecard'

interface Props {
  region: string
  puuid: string
  dd: Ddragon | null
}

const COUNT = 10

export function MatchHistory({ region, puuid, dd }: Props) {
  const [matches, setMatches] = useState<MatchDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMatches([])
    setExpanded(new Set())
    setAnalyzed(new Set())

    ;(async () => {
      try {
        const ids = await getMatchIds(region, puuid, COUNT)
        const results = await runLimited(ids, 4, (id) => getMatchCached(region, id).catch(() => null))
        if (!cancelled) setMatches(results.filter((m): m is MatchDto => m !== null))
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [region, puuid])

  const teammates = useMemo(() => aggregateTeammates(matches, puuid), [matches, puuid])

  // Computed automatically: you + your recurring teammates, on their most recent
  // ranked games. A match's own players are only rated once you hit "Analyze" on
  // it - then on the ranked games each had played *before* that match.
  const ratingReqs = useMemo<RatingRequest[]>(() => {
    const seen = new Set<string>()
    const reqs: RatingRequest[] = []
    const add = (pu: string, before?: number, maxGames?: number) => {
      const k = ratingKey(pu, before, maxGames)
      if (seen.has(k)) return
      seen.add(k)
      reqs.push({ puuid: pu, before, maxGames })
    }

    add(puuid, undefined, CONFIG.selfMaxGames)
    for (const t of teammates) add(t.puuid)
    for (const m of matches) {
      if (!analyzed.has(m.metadata.matchId)) continue
      const me = m.info.participants.find((p) => p.puuid === puuid)
      if (!me) continue
      const rows = expanded.has(m.metadata.matchId)
        ? m.info.participants
        : m.info.participants.filter((p) => p.teamId === me.teamId)
      for (const p of rows) add(p.puuid, m.info.gameCreation)
    }
    return reqs
  }, [puuid, teammates, matches, analyzed, expanded])

  const ratings = usePlayerRatings(region, ratingReqs)
  const ratingAt = (pu: string, before?: number) => ratings.get(ratingKey(pu, before)) ?? null
  const selfRating = ratings.get(ratingKey(puuid, undefined, CONFIG.selfMaxGames)) ?? null

  const self = matches[0]?.info.participants.find((p) => p.puuid === puuid)

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // "Analyze" rates that match's players (form going into the game) and opens all 10.
  const analyze = (id: string) => {
    setAnalyzed((prev) => new Set(prev).add(id))
    setExpanded((prev) => new Set(prev).add(id))
  }

  if (loading) return <p className="muted">Loading last {COUNT} games...</p>
  if (error) return <div className="error">{error}</div>
  if (matches.length === 0) return <p className="muted">No recent matches found.</p>

  return (
    <div className="history">
      <PlayerScorecard
        name={self ? displayName(self) : ''}
        tag={self?.riotIdTagline}
        rating={selfRating}
        dd={dd}
      />

      {teammates.length > 0 && (
        <section className="teammates-summary">
          <h3>Recent teammates ({matches.length} games)</h3>
          <p className="muted small">Players who were on your team in more than one of these games.</p>
          {teammates.map((t) => (
            <PlayerRow
              key={t.puuid}
              dd={dd}
              championName={t.lastChampion}
              name={t.name}
              tag={t.tag}
              timesPlayed={t.count}
              rating={ratingAt(t.puuid)}
            />
          ))}
        </section>
      )}

      <section className="match-list">
        {matches.map((m) => {
          const me = m.info.participants.find((p) => p.puuid === puuid)
          if (!me) return null
          const id = m.metadata.matchId
          const open = expanded.has(id)
          const isAnalyzed = analyzed.has(id)
          const allies = m.info.participants.filter((p) => p.teamId === me.teamId)
          const enemies = m.info.participants.filter((p) => p.teamId !== me.teamId)

          const row = (p: MatchParticipant) => (
            <PlayerRow
              key={p.puuid}
              dd={dd}
              championId={p.championId}
              championName={p.championName}
              name={displayName(p)}
              tag={p.riotIdTagline}
              kda={{ k: p.kills, d: p.deaths, a: p.assists }}
              rating={isAnalyzed ? ratingAt(p.puuid, m.info.gameCreation) : undefined}
              isSelf={p.puuid === puuid}
            />
          )

          return (
            <div key={id} className={`match ${me.win ? 'win' : 'loss'}`}>
              <div className="match-head">
                <span className="result">{me.win ? 'Victory' : 'Defeat'}</span>
                <span>{queueName(m.info.queueId)}</span>
                <span className="muted">
                  {timeAgo(m.info.gameEndTimestamp ?? m.info.gameCreation)}
                </span>
                <span className="muted">{fmtDuration(m.info.gameDuration)}</span>
                {!isAnalyzed && (
                  <button className="link analyze" onClick={() => analyze(id)}>
                    Analyze
                  </button>
                )}
                <button className="link" onClick={() => toggle(id)}>
                  {open ? 'Show my team' : 'Show all 10'}
                </button>
              </div>

              {open ? (
                <>
                  <div className="team-split ally">
                    Your team · {me.win ? 'Victory' : 'Defeat'}
                  </div>
                  {allies.map(row)}
                  <div className="team-split enemy">
                    Enemy team · {me.win ? 'Defeat' : 'Victory'}
                  </div>
                  {enemies.map(row)}
                </>
              ) : (
                allies.map(row)
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

interface TeammateAgg {
  puuid: string
  name: string
  tag?: string
  count: number
  lastChampion?: string
}

function aggregateTeammates(matches: MatchDto[], puuid: string): TeammateAgg[] {
  const map = new Map<string, TeammateAgg>()
  for (const m of matches) {
    const me = m.info.participants.find((p) => p.puuid === puuid)
    if (!me) continue
    for (const p of m.info.participants) {
      if (p.puuid === puuid || p.teamId !== me.teamId) continue
      const prev = map.get(p.puuid)
      if (prev) {
        prev.count += 1
        prev.lastChampion = p.championName
      } else {
        map.set(p.puuid, {
          puuid: p.puuid,
          name: displayName(p),
          tag: p.riotIdTagline,
          count: 1,
          lastChampion: p.championName,
        })
      }
    }
  }
  return [...map.values()].filter((t) => t.count > 1).sort((a, b) => b.count - a.count)
}

function displayName(p: MatchParticipant): string {
  return p.riotIdGameName || p.riotIdName || p.summonerName || 'Unknown'
}

function fmtDuration(d: number): string {
  const s = d > 10000 ? Math.round(d / 1000) : d
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
